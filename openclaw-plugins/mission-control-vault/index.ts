import type { AgentMessage } from "@mariozechner/pi-agent-core";
import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import { emptyPluginConfigSchema } from "openclaw/plugin-sdk";

const KNOWN_FIELDS = new Set(["username", "user", "password", "secret", "value", "token", "api_key"]);

type PlaceholderRef = { handle: string; field?: string };
type PlaceholderMatch = { raw: string; ref: PlaceholderRef };

type CacheEntry = { value: string; expiresAt: number };

function normalizeUrl(input: string) {
  try {
    return new URL(input).toString().replace(/\/$/, "");
  } catch {
    return input.trim().replace(/\/$/, "");
  }
}

function escapeRegex(s: string) {
  return s.replace(/[-/\\^$*+?.()|[\]{}]/g, "\\$&");
}

function normalizeField(field: string | undefined) {
  const f = String(field || "").trim().toLowerCase();
  if (!f) return "secret";
  if (["username", "user"].includes(f)) return "username";
  return "secret";
}

function parseRef(spec: string): PlaceholderRef | null {
  const raw = String(spec || "").trim();
  if (!raw) return null;

  const parts = raw.split(".");
  if (parts.length > 1) {
    const candidate = parts[parts.length - 1] || "";
    if (KNOWN_FIELDS.has(candidate)) {
      const handle = parts.slice(0, -1).join(".");
      if (!handle) return null;
      return { handle, field: candidate };
    }
  }

  return { handle: raw };
}

function findPlaceholdersInString(input: string, prefix: string) {
  const safePrefix = escapeRegex(prefix);
  const re = new RegExp(`\\{\\{\\s*${safePrefix}:([^}]+?)\\s*\\}\\}`, "g");
  const out: PlaceholderMatch[] = [];
  for (const match of String(input || "").matchAll(re)) {
    const raw = match[0] || "";
    const inner = match[1] || "";
    const ref = parseRef(inner);
    if (!raw || !ref) continue;
    out.push({ raw, ref });
  }
  return out;
}

function deepMapStrings<T>(value: T, mapper: (s: string) => string): T {
  if (typeof value === "string") return mapper(value) as T;
  if (!value) return value;
  if (Array.isArray(value)) return value.map((v) => deepMapStrings(v, mapper)) as T;
  if (typeof value === "object") {
    const obj: any = value;
    const out: any = Array.isArray(obj) ? [] : {};
    for (const [k, v] of Object.entries(obj)) out[k] = deepMapStrings(v as any, mapper);
    return out as T;
  }
  return value;
}

function redactMessage(message: AgentMessage, secrets: string[]) {
  if (!secrets.length) return message;
  const filtered = secrets
    .map((s) => String(s || ""))
    .filter((s) => s && s.length >= 6) // avoid noisy redactions for very short secrets
    .sort((a, b) => b.length - a.length);

  return deepMapStrings(message as any, (s) => {
    let out = s;
    for (const secret of filtered) {
      if (!secret) continue;
      // Replace all occurrences. (split/join avoids regex escaping pitfalls.)
      out = out.split(secret).join("****");
    }
    return out;
  }) as AgentMessage;
}

export default {
  id: "mission-control-vault",
  name: "Mission Control Vault",
  description: "Resolve {{vault:HANDLE}} placeholders from Mission Control and redact tool results.",
  configSchema: emptyPluginConfigSchema(),

  register(api: OpenClawPluginApi) {
    const rawCfg = api.pluginConfig && typeof api.pluginConfig === "object" ? (api.pluginConfig as any) : {};
    const missionControlUrl =
      typeof rawCfg.missionControlUrl === "string" && rawCfg.missionControlUrl.trim()
        ? normalizeUrl(rawCfg.missionControlUrl)
        : "";
    const cacheTtlMs =
      typeof rawCfg.cacheTtlMs === "number" && Number.isFinite(rawCfg.cacheTtlMs) && rawCfg.cacheTtlMs > 0
        ? Math.floor(rawCfg.cacheTtlMs)
        : 30_000;
    const timeoutMs =
      typeof rawCfg.timeoutMs === "number" && Number.isFinite(rawCfg.timeoutMs) && rawCfg.timeoutMs > 0
        ? Math.floor(rawCfg.timeoutMs)
        : 5_000;
    const placeholderPrefix =
      typeof rawCfg.placeholderPrefix === "string" && rawCfg.placeholderPrefix.trim() ? rawCfg.placeholderPrefix.trim() : "vault";

    const vaultToken = typeof rawCfg.vaultToken === "string" ? rawCfg.vaultToken.trim() : "";
    const agentTokensRaw = rawCfg.agentTokens && typeof rawCfg.agentTokens === "object" ? rawCfg.agentTokens : null;
    const agentTokens: Record<string, string> | null = agentTokensRaw ? { ...(agentTokensRaw as any) } : null;

    const cache = new Map<string, CacheEntry>();
    const sessionSecrets = new Map<string, { values: Set<string>; expiresAt: number }>();

    function resolveToken(agentId: string | undefined) {
      const a = String(agentId || "").trim();
      if (a && agentTokens && typeof agentTokens[a] === "string" && agentTokens[a]!.trim()) {
        return agentTokens[a]!.trim();
      }
      return vaultToken;
    }

    function touchSessionSecret(sessionKey: string, value: string) {
      const key = sessionKey || "global";
      const now = Date.now();
      const ttl = 10 * 60_000; // keep for redaction only, not long-term
      const existing = sessionSecrets.get(key);
      if (existing && existing.expiresAt > now) {
        existing.values.add(value);
        return;
      }
      sessionSecrets.set(key, { values: new Set([value]), expiresAt: now + ttl });
    }

    async function fetchJson(url: string, token: string, body: unknown) {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), timeoutMs);
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(body),
          signal: ctrl.signal,
        });
        const json = await res.json().catch(() => null);
        return { ok: res.ok, status: res.status, json };
      } finally {
        clearTimeout(t);
      }
    }

    api.on("before_tool_call", async (event, ctx) => {
      const token = resolveToken(ctx.agentId);
      const matches: PlaceholderMatch[] = [];

      // 1) Collect placeholders from params.
      deepMapStrings(event.params as any, (s) => {
        matches.push(...findPlaceholdersInString(s, placeholderPrefix));
        return s;
      });

      if (!matches.length) return;

      if (!missionControlUrl) {
        return {
          block: true,
          blockReason: "Vault placeholders detected, but the Mission Control URL is not configured for the Vault plugin.",
        };
      }

      if (!token) {
        return {
          block: true,
          blockReason: `Vault placeholders detected, but no token configured for agent "${ctx.agentId || "unknown"}".`,
        };
      }

      // 2) Resolve unique (handle, field) pairs with cache.
      const needed: Array<{ k: string; handle: string; field?: string }> = [];
      for (const m of matches) {
        const handle = m.ref.handle;
        const field = normalizeField(m.ref.field);
        const key = `${handle}#${field}`;
        const cached = cache.get(key);
        if (cached && Date.now() < cached.expiresAt) continue;
        needed.push({ k: key, handle, field });
      }

      if (needed.length) {
        const body = {
          requests: needed.map((r) => ({ key: r.k, handle: r.handle, field: r.field })),
          sessionKey: ctx.sessionKey,
          toolName: event.toolName,
        };
        const url = `${missionControlUrl}/api/vault/resolve-batch`;
        const res = await fetchJson(url, token, body);
        if (!res.ok) {
          const detail = String(res.json?.error || `resolve-batch failed (${res.status})`);
          api.logger.warn(`vault: resolve-batch failed: ${detail}`);
          return { block: true, blockReason: "Vault resolve failed. See gateway logs." };
        }

        const values = res.json?.values && typeof res.json.values === "object" ? (res.json.values as Record<string, string>) : null;
        if (!values) return { block: true, blockReason: "Vault resolve returned invalid response." };

        for (const [k, v] of Object.entries(values)) {
          cache.set(k, { value: String(v || ""), expiresAt: Date.now() + cacheTtlMs });
          if (k.endsWith("#secret") && v) touchSessionSecret(String(ctx.sessionKey || ""), String(v));
        }
      }

      // 3) Replace placeholders in params.
      const replaced = deepMapStrings(event.params as any, (s) => {
        const found = findPlaceholdersInString(s, placeholderPrefix);
        if (!found.length) return s;
        return s.replace(new RegExp(`\\{\\{\\s*${escapeRegex(placeholderPrefix)}:([^}]+?)\\s*\\}\\}`, "g"), (raw, inner) => {
          const ref = parseRef(String(inner || ""));
          if (!ref) return raw;
          const field = normalizeField(ref.field);
          const k = `${ref.handle}#${field}`;
          const hit = cache.get(k);
          if (!hit) return raw;
          return hit.value;
        });
      });

      // Ensure secrets used from cache still get added to the redaction set.
      for (const m of matches) {
        const field = normalizeField(m.ref.field);
        if (field !== "secret") continue;
        const k = `${m.ref.handle}#${field}`;
        const hit = cache.get(k);
        if (hit && hit.value) touchSessionSecret(String(ctx.sessionKey || ""), hit.value);
      }

      return { params: replaced as any };
    });

    api.on("tool_result_persist", (event, ctx) => {
      const key = String(ctx.sessionKey || "global");
      const entry = sessionSecrets.get(key);
      if (!entry || entry.expiresAt <= Date.now()) {
        sessionSecrets.delete(key);
        return;
      }
      const secrets = Array.from(entry.values);
      const message = redactMessage(event.message, secrets);
      return { message };
    });
  },
};
