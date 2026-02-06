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

  const out = await openclawToolsInvoke<any>('sessions_send', { sessionKey, message, timeoutSeconds });
  const parsed = out.parsedText;
  // sessions_send returns useful fields like status/reply in parsedText; fall back to raw.
  return NextResponse.json({ ok: true, result: parsed ?? out.raw });
}
