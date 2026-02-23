import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { OpenClawToolsInvokeError, openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

type Body = {
  sessionKey?: string;
  message?: string;
  timeoutSeconds?: number;
  commandId?: string;
  idempotencyKey?: string;
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function requestId(prefix = 'mc-send') {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}-${Date.now().toString(36)}-${rand}`;
}

function normalizeCommandId(value: string) {
  const v = value.trim();
  if (!v) return '';
  // Keep command ids short and header-safe.
  const cleaned = v.replace(/[^a-zA-Z0-9._:-]/g, '-').slice(0, 96);
  return cleaned;
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

  const rawKey = safeString(body.sessionKey);
  let sessionKey = rawKey;
  try {
    sessionKey = decodeURIComponent(rawKey);
  } catch {
    sessionKey = rawKey;
  }
  sessionKey = sessionKey.replace(/ /g, '+');
  const message = safeString(body.message);
  const timeoutSecondsRaw = typeof body.timeoutSeconds === 'number' ? body.timeoutSeconds : 30;
  const timeoutSeconds = Number.isFinite(timeoutSecondsRaw) ? Math.max(0, Math.min(300, timeoutSecondsRaw)) : 30;
  const headerKey = safeString(req.headers.get('x-idempotency-key'));
  const commandId =
    normalizeCommandId(safeString(body.commandId) || safeString(body.idempotencyKey) || headerKey) || requestId();

  if (!sessionKey) return NextResponse.json({ ok: false, error: 'Missing sessionKey' }, { status: 400 });
  if (!message) return NextResponse.json({ ok: false, error: 'Missing message' }, { status: 400 });

  // Keep this conservative: Mission Control only chats with agent sessions by default.
  // This prevents accidentally targeting channels like "slack:*" from the UI.
  if (!sessionKey.startsWith('agent:')) {
    return NextResponse.json(
      { ok: false, error: 'Only agent:* sessions are supported in Mission Control chat for now.' },
      { status: 400 }
    );
  }

  try {
    // `openclawToolsInvoke` has its own timeout; make it track the requested tool timeout so
    // we don't falsely report "Send failed" when the send succeeded but the response was slow.
    const timeoutMs = Math.max(10_000, Math.min(310_000, Math.round((timeoutSeconds + 10) * 1000)));
    const out = await openclawToolsInvoke<any>(
      'sessions_send',
      { sessionKey, message, timeoutSeconds },
      { timeoutMs, commandId }
    );
    const parsed = out.parsedText;
    // sessions_send returns useful fields like status/reply in parsedText; fall back to raw.
    return NextResponse.json({ ok: true, commandId, result: parsed ?? out.raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (err instanceof OpenClawToolsInvokeError && err.blockedByPolicy) {
      return NextResponse.json(
        {
          ok: false,
          commandId,
          blocked: true,
          error:
            'OpenClaw gateway policy blocked sessions_send. Add `gateway.tools.allow: [\"sessions_send\"]` or use a non-HTTP send path.',
          detail: msg || '',
        },
        { status: 409 }
      );
    }
    const looksLikeTimeout = /abort|aborted|timeout|timed out|context deadline exceeded/i.test(msg || '');
    if (looksLikeTimeout) {
      // Ambiguous: the gateway call timed out, but the message is often still delivered.
      // Return 202 so the UI doesn't restore the draft or show a hard failure.
      return NextResponse.json(
        { ok: true, accepted: true, commandId, warning: msg || 'Send accepted; confirmation delayed.' },
        { status: 202 }
      );
    }
    return NextResponse.json({ ok: false, commandId, error: msg || 'Send failed' }, { status: 500 });
  }
}
