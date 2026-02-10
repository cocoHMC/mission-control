import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { pbFetch } from '@/lib/pbServer';
import { isVaultConfigured } from '@/lib/vaultCrypto';
import { generateVaultAccessToken, hashVaultAccessToken } from '@/lib/vaultTokenHash';
import { findRepoRoot } from '@/app/api/setup/_shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

type Body = {
  agentId?: string;
  missionControlUrl?: string;
  label?: string;
  rotateToken?: boolean;
};

function safeString(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

function normalizeUrl(value: string) {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    return value.trim().replace(/\/$/, '');
  }
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const v of values) {
    const s = String(v || '').trim();
    if (s) return s;
  }
  return '';
}

function extractJsonFromOpenClawStdout(stdout: string) {
  const text = String(stdout || '').trim();
  if (!text) return null;

  // OpenClaw may print "Config warnings" before the JSON payload.
  // Attempt to parse from every '{' or '[' position until one succeeds.
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch !== '{' && ch !== '[') continue;
    try {
      return JSON.parse(text.slice(i));
    } catch {
      // keep scanning
    }
  }
  return null;
}

async function getConfigJson(pathKey: string) {
  const res = await runOpenClaw(['config', 'get', pathKey, '--json'], { timeoutMs: 12_000 });
  if (!res.ok) {
    const msg = firstNonEmpty(res.stderr, res.stdout, res.message);
    return { ok: false as const, error: msg || `openclaw config get ${pathKey} failed` };
  }
  const parsed = extractJsonFromOpenClawStdout(String(res.stdout || ''));
  if (parsed == null) return { ok: false as const, error: 'OpenClaw returned invalid JSON.' };
  return { ok: true as const, value: parsed };
}

async function setConfigJson(pathKey: string, value: unknown) {
  // `openclaw config set ... --json` expects a JSON value. Provide a JSON string.
  const payload = JSON.stringify(value);
  const res = await runOpenClaw(['config', 'set', pathKey, payload, '--json'], { timeoutMs: 20_000 });
  if (!res.ok) {
    const msg = firstNonEmpty(res.stderr, res.stdout, res.message);
    return { ok: false as const, error: msg || `openclaw config set ${pathKey} failed` };
  }
  return { ok: true as const };
}

async function dirExists(p: string) {
  try {
    const st = await fs.stat(p);
    return st.isDirectory();
  } catch {
    return false;
  }
}

async function resolveBundledPluginDir(pluginId: string) {
  const appDir = process.env.MC_APP_DIR ? path.resolve(process.env.MC_APP_DIR) : await findRepoRoot();
  const bundled = path.join(appDir, 'openclaw-plugins', pluginId);
  if (await dirExists(bundled)) return bundled;
  const repo = await findRepoRoot(appDir).catch(() => appDir);
  const dev = path.join(repo, 'openclaw-plugins', pluginId);
  if (await dirExists(dev)) return dev;
  return '';
}

async function ensurePbAgent(openclawId: string) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `openclawAgentId = "${openclawId}" || id = "${openclawId}"`,
  });
  const existing = await pbFetch<{ items?: any[] }>(`/api/collections/agents/records?${q.toString()}`);
  const found = existing.items?.[0] ?? null;
  if (found?.id) return found;
  return pbFetch<any>('/api/collections/agents/records', {
    method: 'POST',
    body: { displayName: openclawId, role: '', openclawAgentId: openclawId, status: 'idle' },
  });
}

async function installAndEnable(pluginId: string) {
  const pluginDir = await resolveBundledPluginDir(pluginId);
  if (!pluginDir) {
    return {
      ok: false as const,
      error:
        `Bundled plugin "${pluginId}" not found on this host. ` +
        `This is expected if Mission Control is running without bundled resources (e.g. custom web deploy).`,
    };
  }

  const installRes = await runOpenClaw(['plugins', 'install', '-l', pluginDir], { timeoutMs: 60_000 });
  if (!installRes.ok) {
    const msg = firstNonEmpty(installRes.stderr, installRes.stdout, installRes.message);
    return { ok: false as const, error: msg || 'openclaw plugins install failed' };
  }

  const enableRes = await runOpenClaw(['plugins', 'enable', pluginId], { timeoutMs: 30_000 });
  if (!enableRes.ok) {
    const msg = firstNonEmpty(enableRes.stderr, enableRes.stdout, enableRes.message);
    return { ok: false as const, error: msg || 'openclaw plugins enable failed' };
  }

  return { ok: true as const, pluginDir };
}

async function setConfig(pathKey: string, value: string) {
  const res = await runOpenClaw(['config', 'set', pathKey, value], { timeoutMs: 20_000 });
  if (!res.ok) {
    const msg = firstNonEmpty(res.stderr, res.stdout, res.message);
    return { ok: false as const, error: msg || `openclaw config set ${pathKey} failed` };
  }
  return { ok: true as const };
}

async function repairDuplicateLoadPaths(pluginId: string, desiredPluginDir: string) {
  const got = await getConfigJson('plugins');
  if (!got.ok) return got;

  const plugins = got.value as any;
  const curPaths: string[] = Array.isArray(plugins?.load?.paths) ? plugins.load.paths.filter((p: any) => typeof p === 'string') : [];
  if (!curPaths.length) return { ok: true as const };

  // Keep non-plugin paths, then add exactly one desired path for this plugin.
  const keep = curPaths.filter((p) => !p.includes(`/${pluginId}`));
  keep.push(desiredPluginDir);

  const seen = new Set<string>();
  const nextPaths = keep
    .map((p) => String(p || '').trim())
    .filter((p) => p && (seen.has(p) ? false : (seen.add(p), true)));

  const setPaths = await setConfigJson('plugins.load.paths', nextPaths);
  if (!setPaths.ok) return setPaths;

  // Best-effort: align installs entry so `plugins info` shows the expected source path.
  const curInstall = plugins?.installs?.[pluginId];
  if (curInstall && typeof curInstall === 'object') {
    const nextInstall = { ...curInstall, source: 'path', sourcePath: desiredPluginDir, installPath: desiredPluginDir };
    const setInstall = await setConfigJson(`plugins.installs.${pluginId}`, nextInstall);
    if (!setInstall.ok) return setInstall;
  }

  return { ok: true as const };
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;
  try {
    if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

    let body: Body;
    try {
      body = (await req.json()) as Body;
    } catch {
      body = {};
    }

    const pluginId = 'mission-control-vault';
    const agentId =
      safeString(body.agentId) ||
      safeString(process.env.MC_LEAD_AGENT_ID) ||
      safeString(process.env.MC_LEAD_AGENT) ||
      'main';

    const urlFromReq = safeString(req.nextUrl.origin);
    const missionControlUrl = normalizeUrl(safeString(body.missionControlUrl) || urlFromReq);
    if (!missionControlUrl) return NextResponse.json({ ok: false, error: 'Missing missionControlUrl' }, { status: 400 });

    const install = await installAndEnable(pluginId);
    if (!install.ok) return NextResponse.json({ ok: false, error: install.error }, { status: 502 });

    const agent = await ensurePbAgent(agentId);
    const pbAgentId = safeString(agent?.id);
    if (!pbAgentId) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });

    const base = `plugins.entries.${pluginId}.config`;

    // If already configured and the caller didn't ask to rotate, avoid minting new tokens.
    const rotate = Boolean(body.rotateToken);
    let existingVaultToken: string | null = null;
    if (!rotate) {
      const cfg = await getConfigJson(base);
      if (cfg.ok) {
        const v = cfg.value as any;
        const tok = typeof v?.vaultToken === 'string' ? v.vaultToken.trim() : '';
        if (tok) existingVaultToken = tok;
      }
    }

    const cfg1 = await setConfig(`${base}.missionControlUrl`, missionControlUrl);
    if (!cfg1.ok) return NextResponse.json({ ok: false, error: cfg1.error }, { status: 502 });

    let token: string | null = null;
    let tokenPrefix: string | null = null;
    let alreadyConfigured = false;

    if (existingVaultToken) {
      alreadyConfigured = true;
    } else {
      const label = safeString(body.label) || 'OpenClaw plugin';
      const generated = generateVaultAccessToken();
      token = generated.token;
      tokenPrefix = generated.tokenPrefix;
      const tokenHash = hashVaultAccessToken(generated.token);

      await pbFetch<any>('/api/collections/vault_agent_tokens/records', {
        method: 'POST',
        body: {
          agent: pbAgentId,
          label,
          tokenHash,
          tokenPrefix: generated.tokenPrefix,
          disabled: false,
          lastUsedAt: '',
        },
      });

      const cfg2 = await setConfig(`${base}.vaultToken`, generated.token);
      if (!cfg2.ok) return NextResponse.json({ ok: false, error: cfg2.error }, { status: 502 });
    }

    const cfg3 = await setConfig(`${base}.placeholderPrefix`, 'vault');
    if (!cfg3.ok) return NextResponse.json({ ok: false, error: cfg3.error }, { status: 502 });

    const repair = await repairDuplicateLoadPaths(pluginId, install.pluginDir);
    if (!repair.ok) return NextResponse.json({ ok: false, error: repair.error }, { status: 502 });

    return NextResponse.json(
      {
        ok: true,
        pluginId,
        pluginDir: install.pluginDir,
        missionControlUrl,
        agentId,
        alreadyConfigured,
        tokenPrefix,
        token,
        restartHint: 'Restart OpenClaw to apply: openclaw gateway restart',
      },
      { headers: { 'cache-control': 'no-store' } }
    );
  } catch (err: any) {
    // Next's default behavior can emit an empty 500 body in production. Always return JSON.
    return NextResponse.json(
      { ok: false, error: err?.message ? String(err.message) : String(err) },
      { status: 500, headers: { 'cache-control': 'no-store' } }
    );
  }
}
