import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

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

function toInt(value: string | null) {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const sessionKey = normalizeSessionKey(safeString(url.searchParams.get('sessionKey') || url.searchParams.get('key')));
  const path = safeString(url.searchParams.get('path'));
  const from = toInt(url.searchParams.get('from'));
  const lines = toInt(url.searchParams.get('lines'));

  if (!sessionKey) return NextResponse.json({ ok: false, error: 'sessionKey required' }, { status: 400 });
  if (!path) return NextResponse.json({ ok: false, error: 'path required' }, { status: 400 });

  const args: Record<string, unknown> = { path };
  if (from !== null) args.from = from;
  if (lines !== null) args.lines = lines;

  try {
    const out = await openclawToolsInvoke<any>('memory_get', args, { sessionKey, timeoutMs: 15_000 });
    return NextResponse.json({ ok: true, result: out.parsedText ?? out.raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Failed to read memory file.' }, { status: 502 });
  }
}

