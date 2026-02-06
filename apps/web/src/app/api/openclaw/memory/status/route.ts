import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function isTruthy(value: string | null) {
  const v = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const agent = safeString(url.searchParams.get('agent') || url.searchParams.get('agentId'));
  const deep = isTruthy(url.searchParams.get('deep'));
  const indexIfDirty = isTruthy(url.searchParams.get('index'));

  const args = ['memory', 'status', '--json'];
  if (agent) args.push('--agent', agent);
  if (deep) args.push('--deep');
  if (indexIfDirty) args.push('--index');

  const res = await runOpenClaw(args, { timeoutMs: deep || indexIfDirty ? 30_000 : 12_000 });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load memory status.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    const parsed = stdout ? JSON.parse(stdout) : null;
    return NextResponse.json({ ok: true, result: parsed });
  } catch {
    return NextResponse.json({ ok: true, raw: redactText(stdout).slice(0, 8000) });
  }
}

