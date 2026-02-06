import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

async function getValue(path: string) {
  const res = await runOpenClaw(['config', 'get', path, '--json'], { timeoutMs: 8_000 });
  if (!res.ok) return { ok: false as const, error: redactText(res.stderr || res.stdout || res.message || '').trim() };
  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return { ok: true as const, value: parsed };
  } catch {
    return { ok: false as const, error: 'Invalid JSON from OpenClaw' };
  }
}

async function setValue(path: string, value: unknown) {
  const args = ['config', 'set', path, String(value)];
  const isJson = typeof value === 'number' || typeof value === 'boolean' || value === null || Array.isArray(value) || typeof value === 'object';
  if (isJson) args.push('--json');
  const res = await runOpenClaw(args, { timeoutMs: 12_000 });
  if (!res.ok) return { ok: false as const, error: redactText(res.stderr || res.stdout || res.message || '').trim() };
  return { ok: true as const };
}

type GuidedSnapshot = {
  gateway: {
    port: number | null;
    bind: string | null;
    authMode: string | null;
    tailscaleMode: string | null;
    tailscaleResetOnExit: boolean | null;
  };
  tools: {
    profile: string | null;
  };
  session: {
    maxPingPongTurns: number | null;
  };
  redacted: {
    gatewayAuthToken: true;
    gatewayAuthPassword: true;
  };
};

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const [port, bind, authMode, tsMode, tsReset, toolProfile, maxPingPong] = await Promise.all([
    getValue('gateway.port'),
    getValue('gateway.bind'),
    getValue('gateway.auth.mode'),
    getValue('gateway.tailscale.mode'),
    getValue('gateway.tailscale.resetOnExit'),
    getValue('tools.profile'),
    getValue('session.agentToAgent.maxPingPongTurns'),
  ]);

  const snap: GuidedSnapshot = {
    gateway: {
      port: port.ok && typeof port.value === 'number' ? port.value : null,
      bind: bind.ok && typeof bind.value === 'string' ? bind.value : null,
      authMode: authMode.ok && typeof authMode.value === 'string' ? authMode.value : null,
      tailscaleMode: tsMode.ok && typeof tsMode.value === 'string' ? tsMode.value : null,
      tailscaleResetOnExit: tsReset.ok && typeof tsReset.value === 'boolean' ? tsReset.value : null,
    },
    tools: {
      profile: toolProfile.ok && typeof toolProfile.value === 'string' ? toolProfile.value : null,
    },
    session: {
      maxPingPongTurns: maxPingPong.ok && typeof maxPingPong.value === 'number' ? maxPingPong.value : null,
    },
    redacted: {
      gatewayAuthToken: true,
      gatewayAuthPassword: true,
    },
  };

  return NextResponse.json({ ok: true, snapshot: snap });
}

type GuidedUpdate = {
  gateway?: Partial<GuidedSnapshot['gateway']> & {
    authToken?: string;
    authPassword?: string;
  };
  tools?: Partial<GuidedSnapshot['tools']>;
  session?: Partial<GuidedSnapshot['session']>;
};

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = (await req.json().catch(() => null)) as GuidedUpdate | null;
  if (!body) return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });

  const results: Array<{ path: string; ok: boolean; error?: string }> = [];

  // Gateway
  if (body.gateway) {
    const g = body.gateway;

    if (typeof g.port === 'number') {
      const r = await setValue('gateway.port', g.port);
      results.push({ path: 'gateway.port', ok: r.ok, error: r.ok ? undefined : r.error });
    }
    if (typeof g.bind === 'string' && g.bind.trim()) {
      const r = await setValue('gateway.bind', g.bind.trim());
      results.push({ path: 'gateway.bind', ok: r.ok, error: r.ok ? undefined : r.error });
    }
    if (typeof g.authMode === 'string' && g.authMode.trim()) {
      const r = await setValue('gateway.auth.mode', g.authMode.trim());
      results.push({ path: 'gateway.auth.mode', ok: r.ok, error: r.ok ? undefined : r.error });
    }
    if (typeof g.tailscaleMode === 'string' && g.tailscaleMode.trim()) {
      const r = await setValue('gateway.tailscale.mode', g.tailscaleMode.trim());
      results.push({ path: 'gateway.tailscale.mode', ok: r.ok, error: r.ok ? undefined : r.error });
    }
    if (typeof g.tailscaleResetOnExit === 'boolean') {
      const r = await setValue('gateway.tailscale.resetOnExit', g.tailscaleResetOnExit);
      results.push({ path: 'gateway.tailscale.resetOnExit', ok: r.ok, error: r.ok ? undefined : r.error });
    }

    // Write-only secrets.
    if (typeof (g as any).authToken === 'string' && String((g as any).authToken).trim()) {
      const token = String((g as any).authToken).trim();
      const r = await setValue('gateway.auth.token', token);
      results.push({ path: 'gateway.auth.token', ok: r.ok, error: r.ok ? undefined : r.error });
    }
    if (typeof (g as any).authPassword === 'string' && String((g as any).authPassword).trim()) {
      const password = String((g as any).authPassword).trim();
      const r = await setValue('gateway.auth.password', password);
      results.push({ path: 'gateway.auth.password', ok: r.ok, error: r.ok ? undefined : r.error });
    }
  }

  // Tools
  if (body.tools) {
    const t = body.tools;
    if (typeof t.profile === 'string' && t.profile.trim()) {
      const r = await setValue('tools.profile', t.profile.trim());
      results.push({ path: 'tools.profile', ok: r.ok, error: r.ok ? undefined : r.error });
    }
  }

  // Session
  if (body.session) {
    const s = body.session;
    if (typeof s.maxPingPongTurns === 'number') {
      const r = await setValue('session.agentToAgent.maxPingPongTurns', s.maxPingPongTurns);
      results.push({ path: 'session.agentToAgent.maxPingPongTurns', ok: r.ok, error: r.ok ? undefined : r.error });
    }
  }

  const ok = results.every((r) => r.ok);
  return NextResponse.json({
    ok,
    results,
    restartHint: 'Restart the OpenClaw gateway for these changes to fully apply.',
  }, { status: ok ? 200 : 502 });
}

