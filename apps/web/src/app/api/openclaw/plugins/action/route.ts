import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

type Action = 'enable' | 'disable';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim() as Action;
  const id = String(body?.id || '').trim();

  if (!id) return NextResponse.json({ ok: false, error: 'id required' }, { status: 400 });
  if (action !== 'enable' && action !== 'disable') {
    return NextResponse.json({ ok: false, error: 'action must be enable|disable' }, { status: 400 });
  }

  const res = await runOpenClaw(['plugins', action, id], { timeoutMs: 20_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || `Failed to ${action} plugin.` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, output: String(res.stdout || '').trim() });
}

