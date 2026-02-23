import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

type Body = {
  gatewayUrl?: string;
  token?: string;
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUrl(value: string) {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

function requestId(prefix = 'mc-openclaw-test') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function pushUniqueUrl(target: string[], value: string) {
  const normalized = normalizeUrl(safeString(value));
  if (!normalized) return;
  if (target.includes(normalized)) return;
  target.push(normalized);
}

async function fetchWithTimeout(url: URL, init: RequestInit & { timeoutMs?: number } = {}) {
  const ctrl = new AbortController();
  const timeoutMs = init.timeoutMs ?? 5_000;
  const t = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(t);
  }
}

async function resolveGatewayCandidates(preferred: string) {
  const candidates: string[] = [];
  pushUniqueUrl(candidates, preferred);

  try {
    const preferredUrl = new URL(preferred);
    if (preferredUrl.port) {
      pushUniqueUrl(candidates, `http://127.0.0.1:${preferredUrl.port}`);
      pushUniqueUrl(candidates, `http://localhost:${preferredUrl.port}`);
    }
  } catch {
    // ignore
  }

  try {
    const cli = await runOpenClaw(['gateway', 'status', '--json', '--no-probe', '--timeout', '3000'], {
      timeoutMs: 6_000,
    });
    if (cli.ok) {
      const parsed = JSON.parse(String(cli.stdout || '{}'));
      const host = safeString(parsed?.gateway?.bindHost);
      const portRaw = Number(parsed?.gateway?.port || 0);
      if (host && Number.isFinite(portRaw) && portRaw > 0) {
        pushUniqueUrl(candidates, `http://${host}:${portRaw}`);
        pushUniqueUrl(candidates, `http://127.0.0.1:${portRaw}`);
        pushUniqueUrl(candidates, `http://localhost:${portRaw}`);
      }
    }
  } catch {
    // ignore
  }

  if (!candidates.length) pushUniqueUrl(candidates, 'http://127.0.0.1:18789');
  return candidates;
}

async function invokeWithTimeout(base: string, body: unknown, token: string, source: string, timeoutMs = 5_000) {
  const reqId = requestId();
  const res = await fetchWithTimeout(new URL('/tools/invoke', base), {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      authorization: `Bearer ${token}`,
      'x-mission-control': '1',
      'x-mission-control-source': source,
      'x-openclaw-request-id': reqId,
    },
    body: JSON.stringify(body),
    timeoutMs,
  });
  const text = await res.text().catch(() => '');
  let payload: any = null;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return { res, payload };
}

function errorMessage(payload: any, fallback: string) {
  if (typeof payload === 'object' && payload?.error?.message) return String(payload.error.message);
  if (typeof payload === 'string' && payload.trim()) return payload;
  return fallback;
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

  const gatewayUrl = normalizeUrl(safeString(body.gatewayUrl) || (process.env.OPENCLAW_GATEWAY_URL || 'http://127.0.0.1:18789'));
  const token = safeString(body.token) || (process.env.OPENCLAW_GATEWAY_TOKEN || '');
  if (!gatewayUrl) return NextResponse.json({ ok: false, error: 'Missing gatewayUrl' }, { status: 400 });
  if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 });

  // 1) Resolve gateway URL candidates and validate token with deterministic tools.
  // - sessions_list validates read access
  // - sessions_send (dryRun) validates delivery permissions without dispatching real work
  const candidates = await resolveGatewayCandidates(gatewayUrl);
  let selectedBase = '';
  let invokeJson: any = null;
  let invokeStatus = 0;
  let invokeError = '';

  for (const candidate of candidates) {
    try {
      const out = await invokeWithTimeout(
        candidate,
        { tool: 'sessions_list', args: {} },
        token,
        'openclaw-test'
      );
      invokeStatus = out.res.status;
      invokeJson = out.payload;
      if (out.res.ok) {
        selectedBase = candidate;
        break;
      }
      invokeError = errorMessage(out.payload, `tools/invoke failed (${out.res.status})`);
      if (out.res.status === 401) {
        return NextResponse.json(
          { ok: false, error: 'Unauthorized token. Copy the Tools Invoke token from OpenClaw → Overview.' },
          { status: 502 }
        );
      }
    } catch (err: any) {
      invokeError = safeString(err?.message) || 'tools/invoke request failed.';
    }
  }

  if (!selectedBase) {
    return NextResponse.json(
      {
        ok: false,
        error: invokeError || `Cannot reach OpenClaw gateway (tried ${candidates.length} candidate URL${candidates.length === 1 ? '' : 's'}).`,
        detail: { tried: candidates, status: invokeStatus || undefined },
      },
      { status: 502 }
    );
  }

  let sessionCount: number | null = null;
  try {
    const text = invokeJson?.result?.content?.find((c: any) => c?.type === 'text')?.text;
    if (typeof text === 'string') {
      const parsed = JSON.parse(text);
      if (typeof parsed?.count === 'number') sessionCount = parsed.count;
    }
  } catch {
    sessionCount = null;
  }

  const probeAgent = String(process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'main').trim() || 'main';
  const probeSessionKey = `agent:${probeAgent}:main`;
  let sendProbeRes: Response;
  let sendProbeJson: any = null;
  try {
    const out = await invokeWithTimeout(
      selectedBase,
      {
        tool: 'sessions_send',
        commandId: `${requestId()}-delivery-probe`,
        args: { sessionKey: probeSessionKey, message: '[Mission Control] delivery probe', timeoutSeconds: 0 },
        dryRun: true,
      },
      token,
      'openclaw-test'
    );
    sendProbeRes = out.res;
    sendProbeJson = out.payload;
  } catch (err: any) {
    const detail = safeString(err?.message);
    return NextResponse.json(
      { ok: false, error: detail || 'tools/invoke sessions_send (dryRun) request failed.' },
      { status: 502 }
    );
  }

  if (!sendProbeRes.ok) {
    const msg = errorMessage(sendProbeJson, `tools/invoke sessions_send failed (${sendProbeRes.status})`);
    const lower = msg.toLowerCase();
    const blocked =
      sendProbeRes.status === 404 ||
      sendProbeRes.status === 403 ||
      lower.includes('hard-deny') ||
      lower.includes('hard deny') ||
      lower.includes('blocked') ||
      lower.includes('not allowed') ||
      lower.includes('deny');
    if (blocked) {
      return NextResponse.json(
        {
          ok: false,
          blocked: true,
          error:
            'OpenClaw gateway policy is blocking sessions_send over /tools/invoke. Add `gateway.tools.allow: ["sessions_send"]` or switch Mission Control to non-HTTP delivery fallback.',
          detail: msg,
        },
        { status: 409 }
      );
    }
    return NextResponse.json(
      {
        ok: false,
        error: sendProbeRes.status === 401 ? 'Unauthorized token. Copy the Tools Invoke token from OpenClaw → Overview.' : msg,
      },
      { status: 502 }
    );
  }

  return NextResponse.json({
    ok: true,
    sessionCount,
    gatewayUrl: selectedBase,
    deliveryProbe: { sessionKey: probeSessionKey, mode: 'dryRun' },
  });
}
