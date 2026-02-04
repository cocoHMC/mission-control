import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { patchEnvFile } from '@/lib/envFile';

export const runtime = 'nodejs';

type Body = {
  gatewayUrl?: string;
  token?: string;
  enabled?: boolean;
};

function isTruthy(value: unknown) {
  const v = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

function normalizeUrl(value: string) {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const gatewayUrl = String(process.env.OPENCLAW_GATEWAY_URL || '').trim() || 'http://127.0.0.1:18789';
  const token = String(process.env.OPENCLAW_GATEWAY_TOKEN || '');
  const disabled = isTruthy(process.env.OPENCLAW_GATEWAY_DISABLED);
  return NextResponse.json({ gatewayUrl, token, enabled: !disabled && Boolean(token.trim()) });
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const enabled = Boolean(body.enabled);
  const gatewayUrl = normalizeUrl(String(body.gatewayUrl || '').trim() || 'http://127.0.0.1:18789');
  const token = String(body.token || '').trim();
  if (!gatewayUrl) return NextResponse.json({ ok: false, error: 'Missing gatewayUrl' }, { status: 400 });
  try {
    // Validate URL.
    new URL(gatewayUrl);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid gatewayUrl' }, { status: 400 });
  }

  if (enabled && !token) {
    return NextResponse.json({ ok: false, error: 'Token is required when OpenClaw delivery is enabled.' }, { status: 400 });
  }

  const updates = new Map<string, string>();
  updates.set('OPENCLAW_GATEWAY_URL', gatewayUrl);
  updates.set('OPENCLAW_GATEWAY_TOKEN', enabled ? token : '');
  updates.set('OPENCLAW_GATEWAY_DISABLED', enabled ? 'false' : 'true');

  const envPath = await patchEnvFile(updates);

  const restartMode = process.env.MC_AUTO_RESTART === '1' ? 'auto' : 'manual';
  const restartExitCode = Number.parseInt(process.env.MC_RESTART_EXIT_CODE || '42', 10) || 42;
  if (restartMode === 'auto') {
    const t = setTimeout(() => process.exit(restartExitCode), 750);
    (t as any).unref?.();
  }

  return NextResponse.json({
    ok: true,
    envPath,
    restartRequired: true,
    restartMode,
  });
}

