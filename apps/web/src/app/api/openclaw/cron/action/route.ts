import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function normalizeId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return '';
  if (trimmed.length > 120) return '';
  return trimmed;
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim(); // enable|disable|remove
  const id = normalizeId(String(body?.id || body?.jobId || ''));

  if (!['enable', 'disable', 'remove'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'Invalid action. Use enable|disable|remove.' }, { status: 400 });
  }
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

  const args =
    action === 'remove'
      ? ['cron', 'rm', id, '--json']
      : action === 'enable'
        ? ['cron', 'enable', id]
        : ['cron', 'disable', id];

  const res = await runOpenClaw(args, { timeoutMs: 25_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Cron action failed.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  let parsed: any = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = stdout;
  }

  return NextResponse.json({ ok: true, result: parsed });
}

