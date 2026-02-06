import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

function messageText(content: unknown) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  const parts = content
    .map((part: any) => {
      if (!part || typeof part !== 'object') return '';
      // Avoid surfacing "thinking" in inbox previews.
      if (part.type === 'text' && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean);
  return parts.join('\n');
}

function isoFromMs(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  try {
    return new Date(value).toISOString();
  } catch {
    return '';
  }
}

function toInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const kind = (url.searchParams.get('kind') || '').trim();
  const kindsParam = (url.searchParams.get('kinds') || '').trim();
  const agentId = (url.searchParams.get('agentId') || '').trim();
  const rawSessionKey = (url.searchParams.get('sessionKey') || '').trim();
  let sessionKey = rawSessionKey;
  try {
    sessionKey = decodeURIComponent(rawSessionKey);
  } catch {
    sessionKey = rawSessionKey;
  }
  sessionKey = sessionKey.replace(/ /g, '+');

  const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));
  const limit = clamp(toInt(url.searchParams.get('limit'), 200), 1, 500);
  const activeMinutes = toInt(url.searchParams.get('activeMinutes'), 0);
  const messageLimit = clamp(toInt(url.searchParams.get('messageLimit'), 0), 0, 20);

  // sessions_list does not support offset; we implement pagination by fetching extra rows
  // and slicing after filtering.
  const toolLimit = clamp(limit + offset, 1, 500);
  const args: Record<string, unknown> = { limit: toolLimit, messageLimit };
  const kinds = kindsParam
    ? kindsParam
        .split(',')
        .map((k) => k.trim())
        .filter(Boolean)
    : kind
      ? [kind]
      : [];
  if (kinds.length) args.kinds = kinds;
  if (activeMinutes >= 1) args.activeMinutes = activeMinutes;

  const out = await openclawToolsInvoke<any>('sessions_list', args);
  const parsed = out.parsedText;
  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ ok: false, error: 'OpenClaw returned an unexpected response.' }, { status: 502 });
  }

  // OpenClaw returns sessions under `sessions` with keys like `agent:main:main`.
  let sessions = Array.isArray((parsed as any).sessions) ? (parsed as any).sessions : [];
  let rows = sessions.map((s: any) => {
    const used = typeof s?.totalTokens === 'number' ? s.totalTokens : null;
    const max = typeof s?.contextTokens === 'number' ? s.contextTokens : null;
    return {
      sessionKey: typeof s?.key === 'string' ? s.key : '',
      kind: typeof s?.kind === 'string' ? s.kind : undefined,
      channel: typeof s?.channel === 'string' ? s.channel : undefined,
      label: typeof s?.label === 'string' ? s.label : undefined,
      displayName: typeof s?.displayName === 'string' ? s.displayName : undefined,
      deliveryContext: s?.deliveryContext && typeof s.deliveryContext === 'object' ? s.deliveryContext : undefined,
      updatedAt: isoFromMs(s?.updatedAt) || undefined,
      createdAt: isoFromMs(s?.createdAt) || undefined,
      sessionId: typeof s?.sessionId === 'string' ? s.sessionId : undefined,
      modelProvider: typeof s?.modelProvider === 'string' ? s.modelProvider : undefined,
      model: typeof s?.model === 'string' ? s.model : undefined,
      thinking: typeof s?.thinkingLevel === 'string' ? s.thinkingLevel : undefined,
      verbose: typeof s?.verboseLevel === 'string' ? s.verboseLevel : undefined,
      reasoning: typeof s?.reasoningLevel === 'string' ? s.reasoningLevel : undefined,
      responseUsage: typeof s?.responseUsage === 'string' ? s.responseUsage : undefined,
      systemSent: typeof s?.systemSent === 'boolean' ? s.systemSent : undefined,
      abortedLastRun: typeof s?.abortedLastRun === 'boolean' ? s.abortedLastRun : undefined,
      sendPolicy: typeof s?.sendPolicy === 'string' ? s.sendPolicy : undefined,
      groupActivation: typeof s?.groupActivation === 'string' ? s.groupActivation : undefined,
      lastChannel: typeof s?.lastChannel === 'string' ? s.lastChannel : undefined,
      lastTo: typeof s?.lastTo === 'string' ? s.lastTo : undefined,
      lastAccountId: typeof s?.lastAccountId === 'string' ? s.lastAccountId : undefined,
      inputTokens: typeof s?.inputTokens === 'number' ? s.inputTokens : undefined,
      outputTokens: typeof s?.outputTokens === 'number' ? s.outputTokens : undefined,
      tokensUsed: used ?? undefined,
      tokensMax: max ?? undefined,
      tokensPct: used !== null && max !== null && max > 0 ? Math.round((used / max) * 100) : undefined,
      transcriptPath: typeof s?.transcriptPath === 'string' ? s.transcriptPath : undefined,
      // Optional: sessions_list can include recent messages when messageLimit > 0.
      previewText: (() => {
        const msgs = Array.isArray(s?.messages) ? s.messages : [];
        for (let i = msgs.length - 1; i >= 0; i--) {
          const t = messageText(msgs[i]?.content);
          if (t && t.trim()) return t.trim();
        }
        return undefined;
      })(),
      previewRole: (() => {
        const msgs = Array.isArray(s?.messages) ? s.messages : [];
        if (!msgs.length) return undefined;
        const last = msgs[msgs.length - 1];
        return typeof last?.role === 'string' ? last.role : undefined;
      })(),
      previewAt: (() => {
        const msgs = Array.isArray(s?.messages) ? s.messages : [];
        if (!msgs.length) return undefined;
        const last = msgs[msgs.length - 1];
        return isoFromMs(last?.timestamp) || undefined;
      })(),
    };
  });
  rows = rows.filter((r: any) => typeof r.sessionKey === 'string' && r.sessionKey);
  if (agentId) {
    const prefix = `agent:${agentId}:`;
    rows = rows.filter((row: any) => typeof row?.sessionKey === 'string' && row.sessionKey.startsWith(prefix));
  }
  if (sessionKey) {
    rows = rows.filter((row: any) => typeof row?.sessionKey === 'string' && row.sessionKey.replace(/ /g, '+') === sessionKey);
  }

  const total = rows.length;
  rows = rows.slice(offset, offset + limit);

  return NextResponse.json({
    ok: true,
    count: total,
    offset,
    limit,
    rows,
  });
}
