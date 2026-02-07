import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

type Body = {
  sessionKey?: string;
  key?: string;
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSessionKey(raw: string) {
  let sessionKey = raw;
  try {
    sessionKey = decodeURIComponent(raw);
  } catch {
    sessionKey = raw;
  }
  return sessionKey.replace(/ /g, '+').trim();
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

  const sessionKey = normalizeSessionKey(safeString(body.sessionKey) || safeString(body.key));
  if (!sessionKey) return NextResponse.json({ ok: false, error: 'sessionKey required' }, { status: 400 });

  const params = JSON.stringify({ key: sessionKey });
  const res = await runOpenClaw(['gateway', 'call', 'sessions.reset', '--params', params, '--json', '--timeout', '10000'], {
    timeoutMs: 12_000,
  });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to reset session.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, result: parsed });
  } catch {
    return NextResponse.json({ ok: true, raw: redactText(stdout).slice(0, 4000) });
  }
}

