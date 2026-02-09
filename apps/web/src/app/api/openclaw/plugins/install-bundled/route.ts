import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { findRepoRoot } from '@/app/api/setup/_shared';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export const runtime = 'nodejs';

type Body = {
  id?: string;
};

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
  // Desktop builds ship this under resources/openclaw-plugins/...
  const bundled = path.join(appDir, 'openclaw-plugins', pluginId);
  if (await dirExists(bundled)) return bundled;

  // Dev/repo fallback.
  const repo = await findRepoRoot(appDir).catch(() => appDir);
  const dev = path.join(repo, 'openclaw-plugins', pluginId);
  if (await dirExists(dev)) return dev;

  return '';
}

function safeString(v: unknown) {
  return typeof v === 'string' ? v.trim() : '';
}

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const v of values) {
    const s = String(v || '').trim();
    if (s) return s;
  }
  return '';
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const pluginId = safeString(body.id);
  if (!pluginId) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

  const pluginDir = await resolveBundledPluginDir(pluginId);
  if (!pluginDir) {
    return NextResponse.json(
      {
        ok: false,
        error:
          `Bundled plugin "${pluginId}" not found on this host. ` +
          `This is expected if Mission Control is running without bundled resources (e.g. custom web deploy).`,
      },
      { status: 404 }
    );
  }

  // 1) Install from local path.
  const installRes = await runOpenClaw(['plugins', 'install', '-l', pluginDir], { timeoutMs: 60_000 });
  if (!installRes.ok) {
    const msg = firstNonEmpty(installRes.stderr, installRes.stdout, installRes.message);
    return NextResponse.json({ ok: false, error: msg || 'openclaw plugins install failed' }, { status: 502 });
  }

  // 2) Enable (updates OpenClaw config).
  const enableRes = await runOpenClaw(['plugins', 'enable', pluginId], { timeoutMs: 30_000 });
  if (!enableRes.ok) {
    const msg = firstNonEmpty(enableRes.stderr, enableRes.stdout, enableRes.message);
    return NextResponse.json({ ok: false, error: msg || 'openclaw plugins enable failed' }, { status: 502 });
  }

  return NextResponse.json({
    ok: true,
    pluginId,
    pluginDir,
    restartHint: 'If the plugin does not appear immediately, restart OpenClaw: openclaw gateway restart',
  });
}

