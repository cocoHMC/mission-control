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
  const agentId = (url.searchParams.get('agentId') || '').trim();

  const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));
  const limit = clamp(toInt(url.searchParams.get('limit'), 200), 1, 500);
  const activeMinutes = toInt(url.searchParams.get('activeMinutes'), 0);
  const messageLimit = clamp(toInt(url.searchParams.get('messageLimit'), 0), 0, 20);

  const args: Record<string, unknown> = { offset, limit, messageLimit };
  if (kind) args.kind = kind;
  if (activeMinutes >= 1) args.activeMinutes = activeMinutes;

  const out = await openclawToolsInvoke<any>('sessions_list', args);
  const parsed = out.parsedText;
  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ ok: false, error: 'OpenClaw returned an unexpected response.' }, { status: 502 });
  }

  // OpenClaw returns sessions under `sessions` with keys like `agent:main:main`.
  let sessions = Array.isArray((parsed as any).sessions) ? (parsed as any).sessions : [];
  let rows = sessions.map((s: any) => ({
    sessionKey: typeof s?.key === 'string' ? s.key : '',
    kind: typeof s?.kind === 'string' ? s.kind : undefined,
    channel: typeof s?.channel === 'string' ? s.channel : undefined,
    displayName: typeof s?.displayName === 'string' ? s.displayName : undefined,
    updatedAt: isoFromMs(s?.updatedAt) || undefined,
    sessionId: typeof s?.sessionId === 'string' ? s.sessionId : undefined,
    model: typeof s?.model === 'string' ? s.model : undefined,
    tokensUsed: typeof s?.totalTokens === 'number' ? s.totalTokens : undefined,
    tokensMax: typeof s?.contextTokens === 'number' ? s.contextTokens : undefined,
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
  }));
  rows = rows.filter((r: any) => typeof r.sessionKey === 'string' && r.sessionKey);
  if (agentId) {
    const prefix = `agent:${agentId}:`;
    rows = rows.filter((row: any) => typeof row?.sessionKey === 'string' && row.sessionKey.startsWith(prefix));
  }

  return NextResponse.json({
    ok: true,
    count: typeof (parsed as any).count === 'number' ? (parsed as any).count : rows.length,
    offset,
    limit,
    rows,
  });
}
