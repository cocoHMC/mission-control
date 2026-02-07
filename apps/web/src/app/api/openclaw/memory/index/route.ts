import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

type Body = {
  agent?: string;
  agentId?: string;
  force?: boolean;
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    body = {};
  }

  const agent = safeString(body.agent) || safeString(body.agentId);
  const force = Boolean(body.force);

  const args = ['memory', 'index'];
  if (agent) args.push('--agent', agent);
  if (force) args.push('--force');

  const res = await runOpenClaw(args, { timeoutMs: 120_000 });
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to reindex memory.' }, { status: 502 });
  }

  const stdout = redactText(String(res.stdout || '').trim());
  const stderr = redactText(String(res.stderr || '').trim());
  return NextResponse.json({ ok: true, stdout: stdout.slice(0, 20_000), stderr: stderr.slice(0, 20_000) });
}

