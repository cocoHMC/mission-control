import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function normalizeAgentId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return '';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trimmed)) return '';
  return trimmed;
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const agentId = normalizeAgentId(String(body?.agentId || body?.id || ''));
  const force = Boolean(body?.force ?? true);
  const allowDeleteDefault = Boolean(body?.allowDeleteDefault ?? false);

  if (!agentId) {
    return NextResponse.json({ ok: false, error: 'Invalid agentId.' }, { status: 400 });
  }

  if (!allowDeleteDefault && agentId === 'main') {
    return NextResponse.json(
      { ok: false, error: 'Refusing to delete agent "main" from the UI. Use the OpenClaw CLI if you truly mean it.' },
      { status: 400 }
    );
  }

  const args = ['agents', 'delete', agentId, ...(force ? ['--force'] : []), '--json'];
  const res = await runOpenClaw(args, { timeoutMs: 20_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to delete OpenClaw agent.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  let parsed: any = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = { raw: stdout };
  }

  return NextResponse.json({ ok: true, agentId, result: parsed });
}

