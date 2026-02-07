import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

function isTruthy(v: unknown) {
  const s = String(v || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s);
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const fix = isTruthy(body?.fix);
  const deep = isTruthy(body?.deep);
  const force = isTruthy(body?.force);

  const args = ['doctor', '--non-interactive'];
  if (deep) args.push('--deep');
  if (fix) args.push('--fix', '--yes');
  if (force) args.push('--force');

  const res = await runOpenClaw(args, { timeoutMs: fix ? 90_000 : 45_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: redactText(detail) || 'Doctor failed.' }, { status: 502 });
  }

  const out = redactText(String(res.stdout || '').trimEnd());
  return NextResponse.json({ ok: true, output: out });
}

