import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const channel = String(searchParams.get('channel') || '').trim();
  const account = String(searchParams.get('account') || '').trim();
  const target = String(searchParams.get('target') || '').trim();

  const args = ['channels', 'capabilities', '--json'];
  if (channel) args.push('--channel', channel);
  if (account) args.push('--account', account);
  if (target) args.push('--target', target);

  const res = await runOpenClaw(args, { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load channel capabilities.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, capabilities: parsed });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}

