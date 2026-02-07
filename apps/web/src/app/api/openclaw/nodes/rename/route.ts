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
  const node = String(body?.node || '').trim();
  const name = String(body?.name || '').trim();
  if (!node || !name) return NextResponse.json({ ok: false, error: 'node and name required' }, { status: 400 });

  if (name.length > 64) return NextResponse.json({ ok: false, error: 'name too long' }, { status: 400 });

  const res = await runOpenClaw(['nodes', 'rename', '--node', node, '--name', name, '--json'], { timeoutMs: 20_000 });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to rename node.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, result: parsed });
  } catch {
    return NextResponse.json({ ok: true, raw: redactText(stdout).slice(0, 4000) });
  }
}

