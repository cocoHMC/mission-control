import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function normalizeModelKey(model: string) {
  const trimmed = model.trim();
  if (!trimmed) return '';
  if (trimmed.length > 200) return '';
  return trimmed;
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim();
  const model = normalizeModelKey(String(body?.model || body?.modelKey || ''));

  const allowed = new Set(['add', 'remove', 'clear']);
  if (!allowed.has(action)) {
    return NextResponse.json({ ok: false, error: 'Invalid action. Use add|remove|clear.' }, { status: 400 });
  }

  const args = ['models', 'fallbacks', action];
  if (action !== 'clear') {
    if (!model) return NextResponse.json({ ok: false, error: 'model is required for add/remove' }, { status: 400 });
    args.push(model);
  }

  const res = await runOpenClaw(args, { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Fallback update failed.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, output: String(res.stdout || '').trim() || 'Updated.' });
}

