import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

function actionsEnabled() {
  return String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  if (!actionsEnabled()) {
    return NextResponse.json({ ok: false, error: 'Node actions disabled (set MC_NODE_ACTIONS_ENABLED=true).' }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const requestId = String(body?.requestId || '').trim();
  if (!requestId) return NextResponse.json({ ok: false, error: 'requestId required' }, { status: 400 });

  const res = await runOpenClaw(['nodes', 'reject', requestId, '--json'], { timeoutMs: 20_000 });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to reject node.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, result: parsed });
  } catch {
    return NextResponse.json({ ok: true, raw: redactText(stdout).slice(0, 4000) });
  }
}

