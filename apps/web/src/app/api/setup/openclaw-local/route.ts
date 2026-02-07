import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthConfigured, isLoopbackHost } from '@/app/api/setup/_shared';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

type OpenClawGatewayConfig = {
  port?: number;
  bind?: string;
  mode?: string;
  auth?: { mode?: string; token?: string };
};

function firstNonEmpty(...values: Array<string | undefined | null>) {
  for (const v of values) {
    const s = String(v || '').trim();
    if (s) return s;
  }
  return '';
}

export async function GET(req: NextRequest) {
  // This endpoint can return the local OpenClaw gateway token, so we keep it
  // loopback-only even after setup.
  const host = req.headers.get('host') || '';
  const hostname = host.split(':')[0] || '';
  if (!isLoopbackHost(hostname)) {
    return NextResponse.json({ error: 'OpenClaw discovery is only available from localhost.' }, { status: 403 });
  }

  if (isAdminAuthConfigured()) {
    const guard = requireAdminAuth(req);
    if (guard) return guard;
  }

  const version = await runOpenClaw(['--version'], { timeoutMs: 2_500 });
  if (!version.ok) {
    const msg = firstNonEmpty(version.stderr, version.stdout, version.message);
    return NextResponse.json(
      { ok: false, installed: false, error: msg || 'openclaw CLI not found. Install OpenClaw first.' },
      { status: 404 }
    );
  }

  const gatewayRes = await runOpenClaw(['config', 'get', 'gateway', '--json'], { timeoutMs: 2_500 });
  if (!gatewayRes.ok) {
    const msg = firstNonEmpty(gatewayRes.stderr, gatewayRes.stdout, gatewayRes.message);
    return NextResponse.json({ ok: false, installed: true, error: msg || 'Failed to read OpenClaw config.' }, { status: 500 });
  }

  let gateway: OpenClawGatewayConfig | null = null;
  try {
    gateway = gatewayRes.stdout ? JSON.parse(gatewayRes.stdout) : null;
  } catch {
    gateway = null;
  }

  const port = typeof gateway?.port === 'number' ? gateway.port : null;
  const bind = gateway?.bind ? String(gateway.bind) : null;
  const mode = gateway?.mode ? String(gateway.mode) : null;
  const authMode = gateway?.auth?.mode ? String(gateway.auth.mode) : null;
  const token = gateway?.auth?.token ? String(gateway.auth.token) : '';

  // Conservative suggestion: prefer loopback URL because this endpoint is loopback-only.
  const url = `http://127.0.0.1:${port || 18789}`;

  return NextResponse.json({
    ok: true,
    installed: true,
    version: String(version.stdout || '').trim(),
    gateway: { port, bind, mode, authMode },
    url,
    token,
  });
}
