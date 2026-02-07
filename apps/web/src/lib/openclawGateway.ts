type ToolInvokeOpts = {
  timeoutMs?: number;
  // Tools Invoke can run a tool in the context of a specific session. This is optional;
  // many tools (like sessions_list) are deterministic and do not depend on session context.
  sessionKey?: string;
  action?: string;
  dryRun?: boolean;
};

function isTruthy(value: string | undefined) {
  const v = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

export function getOpenClawGatewayConfig() {
  const gatewayUrl = String(process.env.OPENCLAW_GATEWAY_URL || '').trim() || 'http://127.0.0.1:18789';
  const token = String(process.env.OPENCLAW_GATEWAY_TOKEN || '').trim();
  const disabled = isTruthy(process.env.OPENCLAW_GATEWAY_DISABLED);
  // Optional: call tools in the context of a specific session. Defaults to OpenClaw's "main" resolution.
  const sessionKey = String(process.env.OPENCLAW_TOOLS_SESSION_KEY || '').trim() || undefined;
  return { gatewayUrl, token, disabled, sessionKey };
}

function safeErrorMessage(payload: unknown) {
  if (!payload) return '';
  if (typeof payload === 'string') return payload;
  if (typeof payload === 'object') {
    const anyPayload = payload as any;
    if (typeof anyPayload?.error?.message === 'string') return anyPayload.error.message;
    if (typeof anyPayload?.message === 'string') return anyPayload.message;
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return String(payload);
  }
}

export type ToolInvokeResult<T> = {
  raw: unknown;
  parsedText: T | null;
  text: string | null;
};

let resolvedGatewayUrlCache: { url: string; expiresAt: number } | null = null;

async function fetchOk(url: URL, timeoutMs: number) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'GET', signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

async function resolveGatewayUrl(preferred: string) {
  if (resolvedGatewayUrlCache && Date.now() < resolvedGatewayUrlCache.expiresAt) return resolvedGatewayUrlCache.url;

  // 1) Try the configured gateway URL first.
  try {
    const base = new URL(preferred);
    const ok = await fetchOk(new URL('/api/health', base), 1_000);
    if (ok) {
      resolvedGatewayUrlCache = { url: base.toString().replace(/\/$/, ''), expiresAt: Date.now() + 60_000 };
      return resolvedGatewayUrlCache.url;
    }
  } catch {
    // ignore
  }

  // 2) Fall back to CLI-discovered bind host/port. This covers common cases where the
  // gateway is bound to a Tailnet IP (bind=tailnet) and loopback doesn't work.
  try {
    const { runOpenClaw } = await import('@/app/api/openclaw/cli');
    const cli = await runOpenClaw(['gateway', 'status', '--json', '--no-probe', '--timeout', '3000'], { timeoutMs: 6_000 });
    if (cli.ok) {
      const parsed = JSON.parse(String(cli.stdout || '{}'));
      const host = String(parsed?.gateway?.bindHost || '').trim();
      const port = Number(parsed?.gateway?.port || 0);
      if (host && port) {
        const url = `http://${host}:${port}`;
        const ok = await fetchOk(new URL('/api/health', url), 1_000);
        if (ok) {
          resolvedGatewayUrlCache = { url, expiresAt: Date.now() + 60_000 };
          return url;
        }
        // Even if /api/health isn't reachable (e.g. custom base path), keep the best-effort URL.
        resolvedGatewayUrlCache = { url, expiresAt: Date.now() + 15_000 };
        return url;
      }
    }
  } catch {
    // ignore
  }

  // 3) No working gateway found; fall back to preferred and let the caller return a useful error.
  resolvedGatewayUrlCache = { url: preferred, expiresAt: Date.now() + 5_000 };
  return preferred;
}

export async function openclawToolsInvoke<T = unknown>(
  tool: string,
  args: Record<string, unknown>,
  opts: ToolInvokeOpts = {}
): Promise<ToolInvokeResult<T>> {
  const { gatewayUrl, token, disabled, sessionKey: defaultSessionKey } = getOpenClawGatewayConfig();
  if (disabled) throw new Error('OpenClaw delivery is disabled (OPENCLAW_GATEWAY_DISABLED=1).');
  if (!token) throw new Error('Missing OPENCLAW_GATEWAY_TOKEN. Configure it in /setup.');

  let base: URL;
  try {
    const resolved = await resolveGatewayUrl(gatewayUrl);
    base = new URL(resolved);
  } catch {
    throw new Error('Invalid OPENCLAW_GATEWAY_URL.');
  }

  const timeoutMs = opts.timeoutMs ?? Number(process.env.OPENCLAW_TOOLS_TIMEOUT_MS || 10_000);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const body: Record<string, unknown> = {
      tool,
      args,
      ...(opts.action ? { action: opts.action } : {}),
      ...(typeof opts.dryRun === 'boolean' ? { dryRun: opts.dryRun } : {}),
      ...(opts.sessionKey || defaultSessionKey ? { sessionKey: opts.sessionKey || defaultSessionKey } : {}),
    };

    const res = await fetch(new URL('/tools/invoke', base), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
        // Pass through a hint so OpenClaw logs can attribute calls.
        'x-mission-control': '1',
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    const rawText = await res.text().catch(() => '');
    let raw: unknown = null;
    try {
      raw = rawText ? JSON.parse(rawText) : null;
    } catch {
      raw = rawText;
    }

    if (!res.ok) {
      const msg = safeErrorMessage(raw);
      const prefix = res.status === 401 ? 'Unauthorized OpenClaw token.' : `tools/invoke failed (${res.status}).`;
      throw new Error(`${prefix}${msg ? ` ${msg}` : ''}`.trim());
    }

    const text = (() => {
      const content = (raw as any)?.result?.content;
      if (!Array.isArray(content)) return null;
      const t = content.find((c: any) => c?.type === 'text')?.text;
      return typeof t === 'string' ? t : null;
    })();

    let parsedText: T | null = null;
    if (typeof text === 'string' && text.trim()) {
      try {
        parsedText = JSON.parse(text) as T;
      } catch {
        parsedText = null;
      }
    }

    return { raw, parsedText, text };
  } finally {
    clearTimeout(t);
  }
}
