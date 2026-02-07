import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

type Body = {
  sessionKey?: string;
  key?: string;

  task?: string;
  label?: string;
  agentId?: string;
  model?: string;
  thinking?: string;
  cleanup?: string;
  timeoutSeconds?: number;
  runTimeoutSeconds?: number;
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeSessionKey(raw: string) {
  let sessionKey = raw;
  try {
    sessionKey = decodeURIComponent(raw);
  } catch {
    sessionKey = raw;
  }
  return sessionKey.replace(/ /g, '+').trim();
}

function clampInt(value: unknown, min: number, max: number, fallback: number) {
  const n = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, Math.floor(n)));
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

  const sessionKey = normalizeSessionKey(safeString(body.sessionKey) || safeString(body.key));
  if (!sessionKey) return NextResponse.json({ ok: false, error: 'sessionKey required' }, { status: 400 });

  const task = safeString(body.task);
  if (!task) return NextResponse.json({ ok: false, error: 'task required' }, { status: 400 });

  const args: Record<string, unknown> = { task };
  const label = safeString(body.label);
  const agentId = safeString(body.agentId);
  const model = safeString(body.model);
  const thinking = safeString(body.thinking);
  const cleanup = safeString(body.cleanup).toLowerCase();
  if (label) args.label = label;
  if (agentId) args.agentId = agentId;
  if (model) args.model = model;
  if (thinking) args.thinking = thinking;
  if (cleanup === 'keep' || cleanup === 'delete') args.cleanup = cleanup;

  if (typeof body.runTimeoutSeconds === 'number') args.runTimeoutSeconds = clampInt(body.runTimeoutSeconds, 0, 3600, 0);
  if (typeof body.timeoutSeconds === 'number') args.timeoutSeconds = clampInt(body.timeoutSeconds, 0, 3600, 0);

  try {
    const out = await openclawToolsInvoke<any>('sessions_spawn', args, { sessionKey, timeoutMs: 25_000 });
    return NextResponse.json({ ok: true, result: out.parsedText ?? out.raw });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Failed to spawn sub-agent.' }, { status: 502 });
  }
}

