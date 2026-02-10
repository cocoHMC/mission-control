import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { requireAdminAuth } from '@/lib/adminAuth';
import { adminJsonError } from '@/lib/routeErrors';
import { findRepoRoot, isLoopbackHost } from '@/app/api/setup/_shared';

export const runtime = 'nodejs';

const execFileAsync = promisify(execFile);

async function runNodeScript(appDir: string, scriptRel: string) {
  const nodeBin = process.execPath;
  const scriptPath = path.join(appDir, scriptRel);
  await execFileAsync(nodeBin, [scriptPath], { cwd: appDir, env: process.env });
}

export async function POST(req: NextRequest) {
  try {
    const guard = requireAdminAuth(req);
    if (guard) return guard;

    // Avoid remote schema mutation from non-loopback callers.
    const host = req.headers.get('host') || '';
    const hostname = (host.split(':')[0] || '').trim();
    if (!isLoopbackHost(hostname)) {
      return NextResponse.json({ ok: false, error: 'Repair is only allowed from localhost.' }, { status: 403 });
    }

    const appDir = process.env.MC_APP_DIR ? path.resolve(process.env.MC_APP_DIR) : await findRepoRoot();

    // Best-effort: bring PB schema forward so Vault endpoints work immediately.
    await runNodeScript(appDir, path.join('scripts', 'pb_bootstrap.mjs'));
    await runNodeScript(appDir, path.join('scripts', 'pb_set_settings.mjs')).catch(() => {});
    await runNodeScript(appDir, path.join('scripts', 'pb_set_rules.mjs')).catch(() => {});
    await runNodeScript(appDir, path.join('scripts', 'pb_backfill_vnext.mjs')).catch(() => {});

    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return adminJsonError(err, 'Repair failed');
  }
}

