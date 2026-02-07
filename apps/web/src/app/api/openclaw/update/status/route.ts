import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const v = await runOpenClaw(['--version'], { timeoutMs: 3_000 });
  const res = await runOpenClaw(['update', 'status'], { timeoutMs: 8_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: redactText(detail) || 'Failed to load update status.' }, { status: 502 });
  }

  const version = v.ok ? String(v.stdout || '').trim() : null;
  return NextResponse.json({ ok: true, version, output: redactText(String(res.stdout || '').trimEnd()) });
}
