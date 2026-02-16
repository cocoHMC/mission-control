import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

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

  const out = await openclawToolsInvoke<any>('sessions_send', { sessionKey, message, timeoutSeconds }, { commandId });
  const parsed = out.parsedText;
  // sessions_send returns useful fields like status/reply in parsedText; fall back to raw.
  return NextResponse.json({ ok: true, commandId, result: parsed ?? out.raw });
}
