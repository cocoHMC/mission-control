import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const channel = String(body?.channel || '').trim() || 'whatsapp';
  const account = String(body?.account || '').trim();

  const args: string[] = ['channels', 'logout', '--channel', channel];
  if (account) args.push('--account', account);

  const res = await runOpenClaw(args, { timeoutMs: 30_000 });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to logout channel.' }, { status: 502 });
  }

  const out = redactText(String(res.stdout || '').trim());
  return NextResponse.json({ ok: true, output: out.slice(0, 8000) });
}

