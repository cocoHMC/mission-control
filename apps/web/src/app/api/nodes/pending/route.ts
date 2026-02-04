import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

function actionsEnabled() {
  return String(process.env.MC_NODE_ACTIONS_ENABLED || '').toLowerCase() === 'true';
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  if (!actionsEnabled()) {
    return NextResponse.json({ error: 'Node actions disabled' }, { status: 403 });
  }

  const res = await runOpenClaw(['nodes', 'pending', '--json'], { timeoutMs: 8_000 });
  try {
    if (!res.ok) throw new Error((res.stderr || res.stdout || res.message || 'Failed to fetch pending nodes').trim());
    const parsed = res.stdout ? JSON.parse(res.stdout) : [];
    return NextResponse.json({ items: parsed });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch pending nodes';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
