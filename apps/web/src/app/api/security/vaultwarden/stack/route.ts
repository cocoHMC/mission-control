import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { detectDockerCompose, fileExists, getVaultwardenPaths, runCompose } from '@/app/api/security/vaultwarden/_shared';

export const runtime = 'nodejs';

function actionsEnabled() {
  return String(process.env.MC_SECURITY_ACTIONS_ENABLED || '').toLowerCase() === 'true';
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  if (!actionsEnabled()) {
    return NextResponse.json({ ok: false, error: 'Security actions disabled (MC_SECURITY_ACTIONS_ENABLED=false)' }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  if (!['up', 'down', 'restart', 'pull'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'action must be one of: up, down, restart, pull' }, { status: 400 });
  }

  const { opsDir, composePath } = getVaultwardenPaths();
  if (!(await fileExists(composePath))) {
    return NextResponse.json({ ok: false, error: 'Vaultwarden stack not generated yet' }, { status: 400 });
  }

  const docker = await detectDockerCompose();
  if (!docker.ok || !docker.compose) {
    return NextResponse.json({ ok: false, error: docker.error || 'docker compose not available' }, { status: 500 });
  }

  try {
    if (action === 'pull') {
      await runCompose(docker.compose, ['pull'], { cwd: opsDir });
    } else if (action === 'up') {
      await runCompose(docker.compose, ['up', '-d'], { cwd: opsDir });
    } else if (action === 'down') {
      await runCompose(docker.compose, ['down'], { cwd: opsDir });
    } else if (action === 'restart') {
      await runCompose(docker.compose, ['restart'], { cwd: opsDir });
    }
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    const message = err?.stderr || err?.stdout || err?.message || 'Failed to run docker compose';
    return NextResponse.json({ ok: false, error: message.toString().trim() }, { status: 500 });
  }
}
