import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeBool(value: unknown) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function isSafeAgentId(id: string) {
  // Keep this conservative: OpenClaw agent ids are typically slugs.
  return /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/.test(id);
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const agentId = safeString(body?.agentId || body?.id);
  const name = safeString(body?.name);
  const emoji = safeString(body?.emoji);
  const theme = safeString(body?.theme);
  const avatar = safeString(body?.avatar);
  const fromIdentity = safeBool(body?.fromIdentity);

  if (!agentId) return NextResponse.json({ ok: false, error: 'Missing agentId' }, { status: 400 });
  if (!isSafeAgentId(agentId)) {
    return NextResponse.json({ ok: false, error: 'Invalid agentId' }, { status: 400 });
  }

  const args: string[] = ['agents', 'set-identity', '--agent', agentId, '--json'];
  if (fromIdentity) {
    // Best-effort: OpenClaw will locate IDENTITY.md using agent workspace when possible.
    args.push('--from-identity');
  }
  if (name) args.push('--name', name);
  if (emoji) args.push('--emoji', emoji);
  if (theme) args.push('--theme', theme);
  if (avatar) args.push('--avatar', avatar);

  if (!fromIdentity && !name && !emoji && !theme && !avatar) {
    return NextResponse.json({ ok: false, error: 'Provide at least one identity field.' }, { status: 400 });
  }

  const res = await runOpenClaw(args, { timeoutMs: 15_000 });
  if (!res.ok) {
    const detail = [res.message, res.stderr].filter(Boolean).join('\n').trim();
    return NextResponse.json({ ok: false, error: detail || 'OpenClaw identity update failed.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  try {
    return NextResponse.json({ ok: true, result: stdout ? JSON.parse(stdout) : {} });
  } catch {
    return NextResponse.json({ ok: true, result: stdout });
  }
}

