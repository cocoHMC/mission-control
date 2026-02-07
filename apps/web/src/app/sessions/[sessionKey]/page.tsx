import { AppShell } from '@/components/shell/AppShell';
import { pbFetch } from '@/lib/pbServer';
import type { Agent, PBList } from '@/lib/types';
import { SessionsThreadClient } from '@/app/sessions/sessionsClient';
import { openclawToolsInvoke } from '@/lib/openclawGateway';
import { headers } from 'next/headers';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getAgents() {
  const q = new URLSearchParams({ page: '1', perPage: '200', sort: 'displayName' });
  return pbFetch<PBList<Agent>>(`/api/collections/agents/records?${q.toString()}`);
}

type HistoryRow = {
  timestamp?: string;
  role?: string;
  content?: unknown;
  text?: string;
  message?: string;
};

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

function messageText(content: unknown, includeTools = true) {
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
  return parts.join('\n');
}

function messagePayloadText(payload: any) {
  if (!payload || typeof payload !== 'object') return '';
  if (typeof payload.text === 'string' && payload.text.trim()) return payload.text;
  if (typeof payload.message === 'string' && payload.message.trim()) return payload.message;
  return messageText(payload.content, true);
}

async function getHistory(sessionKey: string): Promise<{ rows: HistoryRow[]; error?: string | null }> {
  if (!sessionKey) return { rows: [], error: 'Missing session key.' };
  const adminUser = String(process.env.MC_ADMIN_USER || '').trim();
  const adminPass = String(process.env.MC_ADMIN_PASSWORD || '').trim();
  if (adminUser && adminPass) {
    try {
      const h = await headers();
      const host = h.get('host') || '127.0.0.1:4015';
      const proto = h.get('x-forwarded-proto') || 'http';
      const qs = new URLSearchParams({
        sessionKey,
        limit: '200',
        offset: '0',
        direction: 'backward',
        includeTools: '1',
      });
      const url = `${proto}://${host}/api/openclaw/sessions/history?${qs.toString()}`;
      const auth = Buffer.from(`${adminUser}:${adminPass}`).toString('base64');
      const res = await fetch(url, { headers: { authorization: `Basic ${auth}` }, cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const rows = Array.isArray(json?.rows) ? json.rows : [];
        return { rows, error: null };
      }
    } catch {
      // fall through
    }
  }
  try {
    const out = await openclawToolsInvoke<any>('sessions_history', {
      sessionKey,
      limit: 200,
      includeTools: true,
    });
    const parsed = out.parsedText;
    if (!parsed || typeof parsed !== 'object') return { rows: [], error: 'OpenClaw returned no history.' };
    const messages = Array.isArray((parsed as any).messages) ? (parsed as any).messages : [];
    const rows = messages.map((m: any) => {
      const role = typeof m?.role === 'string' ? m.role : '';
      const ts = isoFromMs(m?.timestamp) || undefined;
      return {
        role,
        timestamp: ts,
        text: messagePayloadText(m),
      };
    });
    return { rows, error: null };
  } catch {
    return { rows: [], error: 'Failed to load history from OpenClaw.' };
  }
}

export default async function SessionThreadPage({ params }: { params: Promise<{ sessionKey: string }> }) {
  const agents = await getAgents();
  const resolvedParams = await params;
  const rawParam = resolvedParams?.sessionKey ? resolvedParams.sessionKey : '';
  let rawKey = rawParam;
  try {
    rawKey = decodeURIComponent(rawParam);
  } catch {
    rawKey = rawParam;
  }
  rawKey = rawKey.replace(/ /g, '+');
  const historyResult = await getHistory(rawKey);
  return (
    <AppShell scroll="none">
      <div className="flex h-full min-h-0 flex-col">
        <div className="min-h-0 flex-1">
          <SessionsThreadClient
            agents={agents.items ?? []}
            sessionKey={rawKey}
            initialHistory={historyResult.rows}
            initialError={historyResult.error || null}
          />
        </div>
      </div>
    </AppShell>
  );
}
