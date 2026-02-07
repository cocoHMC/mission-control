import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

type Action = 'start' | 'stop' | 'restart';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim() as Action;
  if (action !== 'start' && action !== 'stop' && action !== 'restart') {
    return NextResponse.json({ ok: false, error: 'action must be start|stop|restart' }, { status: 400 });
  }

  const res = await runOpenClaw(['gateway', action], { timeoutMs: 30_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || `Failed to ${action} gateway.` }, { status: 502 });
  }

  return NextResponse.json({ ok: true, output: String(res.stdout || '').trim() });
}

