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

function messageText(content: unknown, { includeTools }: { includeTools: boolean }) {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) {
    if (content && typeof content === 'object') {
      const anyContent = content as any;
      if (typeof anyContent.text === 'string') return anyContent.text;
      if (typeof anyContent.message === 'string') return anyContent.message;
    }
    if (includeTools) {
      try {
        return JSON.stringify(content ?? null, null, 2);
      } catch {
        return String(content ?? '');
      }
    }
    return '';
  }

  const parts = content
    .map((part: any) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text' && typeof part.text === 'string') return part.text;
      return '';
    })
    .filter(Boolean);
  if (parts.length) return parts.join('\n');
  if (!includeTools) return '';
  try {
    return JSON.stringify(content, null, 2);
  } catch {
    return String(content);
  }
}

function messagePayloadText(payload: any, { includeTools }: { includeTools: boolean }) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  const fromContent = messageText(payload.content, { includeTools });
  if (fromContent && fromContent.trim()) return fromContent;
  if (includeTools) {
    try {
      return JSON.stringify(payload, null, 2);
    } catch {
      return String(payload);
    }
  }
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
  const rawKey = String(url.searchParams.get('sessionKey') || '').trim();
  let sessionKey = rawKey;
  try {
    sessionKey = decodeURIComponent(rawKey);
  } catch {
    sessionKey = rawKey;
  }
  sessionKey = sessionKey.replace(/ /g, '+');
  if (!sessionKey) {
    return NextResponse.json({ ok: false, error: 'Missing sessionKey' }, { status: 400 });
  }

  const offset = Math.max(0, toInt(url.searchParams.get('offset'), 0));
  const limit = clamp(toInt(url.searchParams.get('limit'), 200), 1, 500);
  const direction = (url.searchParams.get('direction') || 'backward').trim();
  const includeTools = isTruthy(url.searchParams.get('includeTools'));

  const args: Record<string, unknown> = { sessionKey, offset, limit, direction };

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
      // Keep original message payload available for debugging when includeTools=1.
      raw: includeTools ? m : undefined,
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
