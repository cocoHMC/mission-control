import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function normalizeAgentId(id: string) {
  const trimmed = id.trim();
  if (!trimmed) return '*';
  if (trimmed === '*') return '*';
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(trimmed)) return '';
  return trimmed;
}

function normalizePattern(pattern: string) {
  const trimmed = pattern.trim();
  if (!trimmed) return '';
  if (trimmed.length > 400) return '';
  return trimmed;
}

function normalizeNode(node: string) {
  const trimmed = node.trim();
  if (!trimmed) return '';
  if (trimmed.length > 200) return '';
  return trimmed;
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const action = String(body?.action || '').trim(); // add|remove
  const agent = normalizeAgentId(String(body?.agentId || body?.agent || '*'));
  const pattern = normalizePattern(String(body?.pattern || ''));
  const node = normalizeNode(String(body?.node || ''));
  const target = String(body?.target || '').trim(); // optional: gateway|local

  if (!['add', 'remove'].includes(action)) {
    return NextResponse.json({ ok: false, error: 'Invalid action. Use add|remove.' }, { status: 400 });
  }
  if (!agent) return NextResponse.json({ ok: false, error: 'Invalid agent id.' }, { status: 400 });
  if (!pattern) return NextResponse.json({ ok: false, error: 'pattern is required' }, { status: 400 });

  const args = ['approvals', 'allowlist', action, pattern, '--agent', agent, '--json'];
  if (node) args.push('--node', node);
  if (target === 'gateway') args.push('--gateway');

  const res = await runOpenClaw(args, { timeoutMs: 12_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr, res.stdout].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'Allowlist update failed.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  let parsed: any = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = { raw: stdout };
  }

  return NextResponse.json({ ok: true, result: parsed });
}

