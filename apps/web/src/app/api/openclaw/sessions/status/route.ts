import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

type Body = {
  sessionKey?: string;
  key?: string;
  model?: string;
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

function normalizeModel(raw: string) {
  const v = raw.trim();
  if (!v) return '';
  if (v.toLowerCase() === 'default') return 'default';
  return v;
}

function statusTextFromRaw(raw: any) {
  const details = raw?.result?.details;
  if (details && typeof details?.statusText === 'string' && details.statusText.trim()) return details.statusText.trim();
  const content = raw?.result?.content;
  if (Array.isArray(content)) {
    const t = content.find((c: any) => c?.type === 'text')?.text;
    if (typeof t === 'string' && t.trim()) return t.trim();
  }
  return null;
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const sessionKey = normalizeSessionKey(safeString(url.searchParams.get('sessionKey') || url.searchParams.get('key')));
  if (!sessionKey) return NextResponse.json({ ok: false, error: 'sessionKey required' }, { status: 400 });

  try {
    const out = await openclawToolsInvoke<any>('session_status', {}, { sessionKey, timeoutMs: 12_000 });
    const statusText = statusTextFromRaw(out.raw);
    return NextResponse.json({ ok: true, statusText, raw: out.raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Failed to fetch session status.' }, { status: 502 });
  }
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

  const model = normalizeModel(safeString(body.model));
  if (!model) return NextResponse.json({ ok: false, error: 'model required (use "default" to clear).' }, { status: 400 });

  try {
    const out = await openclawToolsInvoke<any>('session_status', { model }, { sessionKey, timeoutMs: 25_000 });
    const statusText = statusTextFromRaw(out.raw);
    return NextResponse.json({ ok: true, statusText, raw: out.raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Failed to update session.' }, { status: 502 });
  }
}
