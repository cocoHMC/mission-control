import { NextRequest, NextResponse } from 'next/server';
import path from 'node:path';
import { requireAdminAuth } from '@/lib/adminAuth';
import { runOpenClaw } from '@/app/api/openclaw/cli';
import { redactText } from '@/app/api/openclaw/redact';

export const runtime = 'nodejs';

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

function isoFromMs(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  try {
    return new Date(value).toISOString();
  } catch {
    return '';
  }
}

function agentIdFromSessionKey(sessionKey: string) {
  if (!sessionKey.startsWith('agent:')) return '';
  const parts = sessionKey.split(':');
  if (parts.length < 3) return '';
  return parts[1] || '';
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const sessionKey = normalizeSessionKey(safeString(url.searchParams.get('sessionKey') || url.searchParams.get('key')));
  if (!sessionKey) return NextResponse.json({ ok: false, error: 'sessionKey required' }, { status: 400 });

  const agentId = agentIdFromSessionKey(sessionKey);
  const params: Record<string, unknown> = {
    includeGlobal: true,
    includeUnknown: true,
    search: sessionKey,
    limit: 500,
  };
  if (agentId) params.agentId = agentId;

  const res = await runOpenClaw(
    ['gateway', 'call', 'sessions.list', '--params', JSON.stringify(params), '--json', '--timeout', '10000'],
    { timeoutMs: 12_000 }
  );
  if (!res.ok) {
    const detail = redactText([res.message, res.stderr, res.stdout].filter(Boolean).join('\n')).trim();
    return NextResponse.json({ ok: false, error: detail || 'Failed to load session.' }, { status: 502 });
  }

  const stdout = String(res.stdout || '').trim();
  let parsed: any = null;
  try {
    parsed = stdout ? JSON.parse(stdout) : null;
  } catch {
    parsed = null;
  }
  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ ok: false, error: 'OpenClaw returned an unexpected response.' }, { status: 502 });
  }

  const sessions = Array.isArray(parsed.sessions) ? parsed.sessions : [];
  const found =
    sessions.find((s: any) => normalizeSessionKey(String(s?.key || '')) === sessionKey) ??
    sessions.find((s: any) => String(s?.key || '').trim() === sessionKey) ??
    null;
  if (!found) {
    return NextResponse.json({ ok: false, error: 'Session not found (it may have been deleted).' }, { status: 404 });
  }

  const defaults = parsed.defaults && typeof parsed.defaults === 'object' ? parsed.defaults : null;
  const used = typeof found?.totalTokens === 'number' ? found.totalTokens : null;
  const max =
    typeof found?.contextTokens === 'number'
      ? found.contextTokens
      : typeof defaults?.contextTokens === 'number'
        ? defaults.contextTokens
        : null;

  const storePath = typeof parsed?.path === 'string' ? parsed.path : '';
  const sessionId = typeof found?.sessionId === 'string' ? found.sessionId : '';
  const transcriptPath =
    sessionId && storePath && storePath.includes('/') ? path.join(path.dirname(storePath), `${sessionId}.jsonl`) : undefined;

  const row = {
    sessionKey: typeof found?.key === 'string' ? found.key : sessionKey,
    kind: typeof found?.kind === 'string' ? found.kind : undefined,
    channel: typeof found?.channel === 'string' ? found.channel : undefined,
    label: typeof found?.label === 'string' ? found.label : undefined,
    displayName: typeof found?.displayName === 'string' ? found.displayName : undefined,
    deliveryContext: found?.deliveryContext && typeof found.deliveryContext === 'object' ? found.deliveryContext : undefined,
    updatedAt: isoFromMs(found?.updatedAt) || undefined,
    createdAt: isoFromMs(found?.createdAt) || undefined,
    sessionId: sessionId || undefined,
    modelProvider: typeof found?.modelProvider === 'string' ? found.modelProvider : undefined,
    model: typeof found?.model === 'string' ? found.model : undefined,
    thinking: typeof found?.thinkingLevel === 'string' ? found.thinkingLevel : undefined,
    verbose: typeof found?.verboseLevel === 'string' ? found.verboseLevel : undefined,
    reasoning: typeof found?.reasoningLevel === 'string' ? found.reasoningLevel : undefined,
    responseUsage: typeof found?.responseUsage === 'string' ? found.responseUsage : undefined,
    elevatedLevel: typeof found?.elevatedLevel === 'string' ? found.elevatedLevel : undefined,
    execHost: typeof found?.execHost === 'string' ? found.execHost : undefined,
    execSecurity: typeof found?.execSecurity === 'string' ? found.execSecurity : undefined,
    execAsk: typeof found?.execAsk === 'string' ? found.execAsk : undefined,
    execNode: typeof found?.execNode === 'string' ? found.execNode : undefined,
    spawnedBy: typeof found?.spawnedBy === 'string' ? found.spawnedBy : undefined,
    sendPolicy: typeof found?.sendPolicy === 'string' ? found.sendPolicy : undefined,
    groupActivation: typeof found?.groupActivation === 'string' ? found.groupActivation : undefined,
    systemSent: typeof found?.systemSent === 'boolean' ? found.systemSent : undefined,
    abortedLastRun: typeof found?.abortedLastRun === 'boolean' ? found.abortedLastRun : undefined,
    lastChannel: typeof found?.lastChannel === 'string' ? found.lastChannel : undefined,
    lastTo: typeof found?.lastTo === 'string' ? found.lastTo : undefined,
    lastAccountId: typeof found?.lastAccountId === 'string' ? found.lastAccountId : undefined,
    inputTokens: typeof found?.inputTokens === 'number' ? found.inputTokens : undefined,
    outputTokens: typeof found?.outputTokens === 'number' ? found.outputTokens : undefined,
    tokensUsed: used ?? undefined,
    tokensMax: max ?? undefined,
    tokensPct: used !== null && max !== null && max > 0 ? Math.round((used / max) * 100) : undefined,
    transcriptPath,
  };

  return NextResponse.json({ ok: true, row, defaults });
}

