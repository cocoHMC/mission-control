import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

function clampInt(value: string | null, min: number, max: number, fallback: number) {
  const n = Number.parseInt(String(value || ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function clampFloat(value: string | null, min: number, max: number, fallback: number) {
  const n = Number.parseFloat(String(value || ''));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const query = String(url.searchParams.get('q') || url.searchParams.get('query') || '').trim();
  const agent = String(url.searchParams.get('agent') || url.searchParams.get('agentId') || '').trim();
  const rawSessionKey = String(url.searchParams.get('sessionKey') || url.searchParams.get('key') || '').trim();
  const maxResults = clampInt(url.searchParams.get('maxResults'), 1, 50, 8);
  const minScore = clampFloat(url.searchParams.get('minScore'), 0, 1, 0);

  if (!query) return NextResponse.json({ ok: false, error: 'q required' }, { status: 400 });

  let sessionKey = rawSessionKey;
  try {
    sessionKey = decodeURIComponent(rawSessionKey);
  } catch {
    sessionKey = rawSessionKey;
  }
  sessionKey = sessionKey.replace(/ /g, '+').trim();
  if (!sessionKey && agent) sessionKey = `agent:${agent}:main`;

  if (!sessionKey) {
    return NextResponse.json({ ok: false, error: 'Provide sessionKey (recommended) or agent.' }, { status: 400 });
  }

  try {
    const out = await openclawToolsInvoke<any>('memory_search', { query, maxResults, minScore }, { sessionKey, timeoutMs: 30_000 });
    return NextResponse.json({ ok: true, result: out.parsedText ?? out.raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Failed to search memory.' }, { status: 502 });
  }
}
