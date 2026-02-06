import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function isTruthy(value: string | null) {
  const v = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const deep = isTruthy(searchParams.get('deep'));
  const usage = isTruthy(searchParams.get('usage'));
  const all = isTruthy(searchParams.get('all'));

  const args = ['status', '--json'];
  if (all) args.push('--all');
  if (usage) args.push('--usage');
  if (deep) args.push('--deep');

  const res = await runOpenClaw(args, { timeoutMs: deep ? 25_000 : 12_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load OpenClaw status.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, report: parsed });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}

