import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

type Action = 'enable' | 'disable';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const res = await runOpenClaw(['system', 'heartbeat', 'last', '--json'], { timeoutMs: 12_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load heartbeat status.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, last: parsed });
  } catch {
    return NextResponse.json(
      { ok: false, error: 'OpenClaw returned invalid JSON.', raw: stdout.slice(0, 2000) },
      { status: 502 }
    );
  }
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim() as Action;
  if (action !== 'enable' && action !== 'disable') {
    return NextResponse.json({ ok: false, error: 'action must be enable|disable' }, { status: 400 });
  }

  const res = await runOpenClaw(['system', 'heartbeat', action, '--json'], { timeoutMs: 20_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || `Failed to ${action} heartbeats.` }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, result: parsed });
  } catch {
    // Some OpenClaw versions return plain text; keep it readable.
    return NextResponse.json({ ok: true, output: stdout.slice(0, 4000) });
  }
}

