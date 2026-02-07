import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => null);
  const channel = String(body?.channel || '').trim();
  const account = String(body?.account || '').trim();
  const del = Boolean(body?.delete);
  if (!channel) return NextResponse.json({ ok: false, error: 'channel required' }, { status: 400 });

  const args: string[] = ['channels', 'remove', '--channel', channel];
  if (account) args.push('--account', account);
  if (del) args.push('--delete');

  const res = await runOpenClaw(args, { timeoutMs: 25_000 });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to remove channel.' }, { status: 502 });
  }

  const out = redactText(String(res.stdout || '').trim());
  return NextResponse.json({ ok: true, output: out.slice(0, 8000) });
}

