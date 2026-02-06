import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

function isTruthy(v: unknown) {
  const s = String(v || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(s);
}

type Channel = 'stable' | 'beta' | 'dev';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const channel = String(body?.channel || '').trim() as Channel;
  const tag = String(body?.tag || '').trim();
  const noRestart = isTruthy(body?.noRestart);

  if (channel && channel !== 'stable' && channel !== 'beta' && channel !== 'dev') {
    return NextResponse.json({ ok: false, error: 'channel must be stable|beta|dev' }, { status: 400 });
  }

  const args = ['update', '--yes'];
  if (channel) args.push('--channel', channel);
  if (tag) args.push('--tag', tag);
  if (noRestart) args.push('--no-restart');

  const res = await runOpenClaw(args, { timeoutMs: 20 * 60_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: redactText(detail) || 'Update failed.' }, { status: 502 });
  }

  return NextResponse.json({ ok: true, output: redactText(String(res.stdout || '').trimEnd()) });
}

