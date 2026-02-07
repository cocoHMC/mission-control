import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { openclawToolsInvoke } from '@/lib/openclawGateway';

export const runtime = 'nodejs';

function isoFromMs(value: unknown) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '';
  try {
    return new Date(value).toISOString();
  } catch {
    return '';
  }
}

function truncate(value: string, max = 1200) {
  if (value.length <= max) return value;
  return `${value.slice(0, max)}…`;
}

function pickString(input: any, keys: string[]) {
  if (!input || typeof input !== 'object') return '';
  for (const key of keys) {
    const value = (input as any)[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

function toolCallSummary(name: string, args: any) {
  const target =
    pickString(args, ['to', 'recipient', 'recipients', 'channel', 'thread', 'phone', 'number', 'email']) ||
    pickString(args?.payload, ['to', 'recipient', 'recipients', 'channel', 'thread', 'phone', 'number', 'email']);
  const subject = pickString(args, ['subject', 'title']) || pickString(args?.payload, ['subject', 'title']);
  const body =
    pickString(args, ['message', 'text', 'body', 'content']) || pickString(args?.payload, ['message', 'text', 'body', 'content']);

  let summary = `Tool: ${name || 'tool'}`;
  if (target) summary += ` to ${target}`;
  if (subject) summary += ` — ${subject}`;
  if (body) summary += `\n${truncate(body)}`;
  return summary;
}

function toolResultSummary(output: any) {
  if (typeof output === 'string' && output.trim()) return `Result:\n${truncate(output.trim())}`;
  if (output && typeof output === 'object') {
    const text = pickString(output, ['message', 'text', 'body', 'content']);
    if (text) return `Result:\n${truncate(text)}`;
  }
  return 'Result received.';
}

function messageText(content: unknown, { includeTools }: { includeTools: boolean }) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) {
    if (content && typeof content === 'object') {
      const anyContent = content as any;
      if (typeof anyContent.text === 'string') return anyContent.text;
      if (typeof anyContent.message === 'string') return anyContent.message;
    }
    return '';
  }

  const parts = content
    .map((part: any) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text' && typeof part.text === 'string') return part.text;
      if (!includeTools) return '';
      if (part.type === 'toolCall') return toolCallSummary(String(part.name || ''), part.arguments);
      if (part.type === 'toolResult') return toolResultSummary(part.output ?? part.result ?? part);
      return '';
    })
    .filter(Boolean);
  if (parts.length) return parts.join('\n');
  return '';
}

function messagePayloadText(payload: any, { includeTools }: { includeTools: boolean }) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  const fromContent = messageText(payload.content, { includeTools });
  if (fromContent && fromContent.trim()) return fromContent;
  return '';
}

function toInt(value: string | null, fallback: number) {
  if (!value) return fallback;
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function isTruthy(value: string | null) {
  const v = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on'].includes(v);
}

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const url = new URL(req.url);
  const rawSessionId = String(url.searchParams.get('sessionId') || '').trim();
  const rawKey = String(url.searchParams.get('sessionKey') || '').trim();
  let sessionKey = rawKey;
  try {
    sessionKey = decodeURIComponent(rawKey);
  } catch {
    sessionKey = rawKey;
  }
  sessionKey = sessionKey.replace(/ /g, '+');
  const sessionId = rawSessionId;
  if (!sessionKey && sessionId) sessionKey = sessionId;
  if (!sessionKey) return NextResponse.json({ ok: false, error: 'Missing sessionKey or sessionId' }, { status: 400 });

  const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));
  const limit = clamp(toInt(url.searchParams.get('limit'), 200), 1, 500);
  const includeTools = isTruthy(url.searchParams.get('includeTools'));

  const args: Record<string, unknown> = {
    sessionKey,
    limit,
    includeTools,
  };

  const out = await openclawToolsInvoke<any>('sessions_history', args);
  const parsed = out.parsedText;
  if (!parsed || typeof parsed !== 'object') {
    return NextResponse.json({ ok: false, error: 'OpenClaw returned an unexpected response.' }, { status: 502 });
  }

  const messages = Array.isArray((parsed as any).messages) ? (parsed as any).messages : [];
  let rows = messages.map((m: any) => {
    const role = typeof m?.role === 'string' ? m.role : '';
    const ts = isoFromMs(m?.timestamp) || undefined;
    return {
      role,
      timestamp: ts,
      text: messagePayloadText(m, { includeTools }),
    };
  });

  if (!includeTools) {
    rows = rows.filter((r: any) => r.role !== 'tool' || (typeof r.text === 'string' && r.text.trim()));
  }

  return NextResponse.json({
    ok: true,
    count: rows.length,
    offset,
    limit,
    rows,
  });
}
