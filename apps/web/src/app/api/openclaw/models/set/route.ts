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
  const model = normalizeModelKey(String(body?.model || body?.modelKey || ''));
  if (!model) return NextResponse.json({ ok: false, error: 'model is required' }, { status: 400 });

  const res = await runOpenClaw(['models', 'set', model], { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to set default model.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, output: String(res.stdout || '').trim() || 'Updated.' });
}

