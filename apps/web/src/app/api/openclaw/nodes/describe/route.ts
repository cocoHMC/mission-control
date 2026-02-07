import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const { searchParams } = new URL(req.url);
  const node = String(searchParams.get('node') || '').trim();
  if (!node) return NextResponse.json({ ok: false, error: 'node query param required' }, { status: 400 });

  const res = await runOpenClaw(['nodes', 'describe', '--node', node, '--json'], { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to describe node.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, describe: parsed });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: redactText(stdout).slice(0, 2000) },
      { status: 502 }
    );
  }
}

