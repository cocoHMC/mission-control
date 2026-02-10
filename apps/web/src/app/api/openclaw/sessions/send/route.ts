import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

type Body = {
  sessionKey?: string;
  message?: string;
  timeoutSeconds?: number;
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
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
    const out = await openclawToolsInvoke<any>('sessions_send', { sessionKey, message, timeoutSeconds }, { timeoutMs });
    const parsed = out.parsedText;
    // sessions_send returns useful fields like status/reply in parsedText; fall back to raw.
    return NextResponse.json({ ok: true, result: parsed ?? out.raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    const looksLikeTimeout = /abort|aborted|timeout|timed out|context deadline exceeded/i.test(msg || '');
    if (looksLikeTimeout) {
      // Ambiguous: the gateway call timed out, but the message is often still delivered.
      // Return 202 so the UI doesn't restore the draft or show a hard failure.
      return NextResponse.json({ ok: true, accepted: true, warning: msg || 'Send accepted; confirmation delayed.' }, { status: 202 });
    }
    return NextResponse.json({ ok: false, error: msg || 'Send failed' }, { status: 500 });
  }
}
