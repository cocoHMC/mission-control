'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CalendarClock,
  ChevronLeft,
  Layers,
  ListTodo,
  MessageCircle,
  RefreshCw,
  Search,
  Send,
  Users,
  Bot,
  Plus,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn, formatShortDate } from '@/lib/utils';
import { mcFetch } from '@/lib/clientApi';
import type { Agent } from '@/lib/types';

type SessionRow = {
  sessionKey: string;
  kind?: string;
  updatedAt?: string;
  createdAt?: string;
  model?: string;
  thinking?: string;
  messageCount?: number;
  tokensUsed?: number;
  tokensMax?: number;
  tokensPct?: number;
  channel?: string;
  displayName?: string;
  previewText?: string;
  previewRole?: string;
  previewAt?: string;
};

type HistoryRow = {
  timestamp?: string;
  role?: string;
  content?: unknown;
  text?: string;
  message?: string;
};

type InboxMode = 'all' | 'mc' | 'dm' | 'group' | 'cron' | 'other';

function agentIdFromSessionKey(sessionKey: string) {
  if (!sessionKey.startsWith('agent:')) return null;
  const parts = sessionKey.split(':');
  if (parts.length < 3) return null;
  return parts[1] || null;
}

function normalizeMessageText(row: any): string {
  if (!row) return '';
  if (typeof row.text === 'string') return row.text;
  if (typeof row.message === 'string') return row.message;
  if (typeof row.content === 'string') return row.content;

  const content = row.content;
  if (Array.isArray(content)) {
    const texts = content
      .map((c) => {
        if (typeof c === 'string') return c;
        if (c && typeof c === 'object' && typeof (c as any).text === 'string') return (c as any).text;
        return '';
      })
      .filter(Boolean);
    if (texts.length) return texts.join('\n');
  }
  if (content && typeof content === 'object') {
    const anyContent = content as any;
    if (typeof anyContent.text === 'string') return anyContent.text;
    if (typeof anyContent.message === 'string') return anyContent.message;
  }

  try {
    return JSON.stringify(row.content ?? row, null, 2);
  } catch {
    return String(row.content ?? '');
  }
}

function sessionCategory(row: SessionRow): InboxMode {
  const key = row.sessionKey || '';
  if (key.includes(':mc:')) return 'mc';
  if (key.includes(':cron:')) return 'cron';
  if (row.kind === 'group' || key.includes(':group:')) return 'group';
  if (key.includes(':dm:')) return 'dm';
  return 'other';
}

function sessionTitle(row: SessionRow, agents: Agent[]) {
  const key = row.sessionKey || '';
  const parts = key.split(':');
  const agentId = agentIdFromSessionKey(key);
  const agent = agentId
    ? agents.find((a) => (a.openclawAgentId || a.id) === agentId || a.id === agentId) || null
    : null;
  const agentName = agent?.displayName || agentId || 'agent';

  if (key.includes(':mc:')) {
    const taskId = parts[3] || '';
    return { title: `Task ${taskId || 'Mission Control'}`, subtitle: agentName, icon: 'task' };
  }
  if (key.includes(':cron:')) {
    const job = parts[3] || '';
    return { title: `Cron ${job ? job.slice(0, 8) : 'job'}`, subtitle: agentName, icon: 'cron' };
  }
  if (key.includes(':dm:')) {
    const contact = parts.slice(parts.indexOf('dm') + 1).join(':') || row.displayName || 'DM';
    return { title: contact, subtitle: `${agentName} · ${row.channel || parts[2] || 'dm'}`, icon: 'dm' };
  }
  if (row.kind === 'group' || key.includes(':group:')) {
    const grp = row.displayName || parts.slice(2).join(':') || 'Group';
    return { title: grp, subtitle: `${agentName} · ${row.channel || parts[2] || 'group'}`, icon: 'group' };
  }

  if (parts.length >= 3 && parts[2] === 'main') {
    return { title: `${agentName}`, subtitle: 'Main session', icon: 'main' };
  }

  const label = row.displayName || parts.slice(2).join(':') || key;
  return { title: label, subtitle: `${agentName} · ${row.channel || parts[2] || 'session'}`, icon: 'other' };
}

function sessionIcon(icon: string) {
  switch (icon) {
    case 'task':
      return ListTodo;
    case 'cron':
      return CalendarClock;
    case 'dm':
      return MessageCircle;
    case 'group':
      return Users;
    case 'main':
      return Bot;
    default:
      return Layers;
  }
}

function formatWhen(iso?: string) {
  if (!iso) return '';
  try {
    const ms = Date.parse(iso);
    if (!Number.isFinite(ms)) return '';
    const delta = Date.now() - ms;
    if (delta < 60_000) return 'now';
    if (delta < 60 * 60_000) return `${Math.round(delta / 60_000)}m`;
    if (delta < 24 * 60 * 60_000) return `${Math.round(delta / (60 * 60_000))}h`;
    return formatShortDate(iso);
  } catch {
    return '';
  }
}

const inboxFilters: Array<{ id: InboxMode; label: string }> = [
  { id: 'all', label: 'All' },
  { id: 'mc', label: 'Tasks' },
  { id: 'dm', label: 'DMs' },
  { id: 'group', label: 'Groups' },
  { id: 'cron', label: 'Cron' },
  { id: 'other', label: 'Other' },
];

export function SessionsInboxClient({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<SessionRow[]>([]);
  const [selectedAgent, setSelectedAgent] = React.useState('');
  const [inboxMode, setInboxMode] = React.useState<InboxMode>('all');
  const [query, setQuery] = React.useState('');
  const [newOpen, setNewOpen] = React.useState(false);
  const [newAgent, setNewAgent] = React.useState('');
  const [newSessionKey, setNewSessionKey] = React.useState('');
  const [newMessage, setNewMessage] = React.useState('');
  const [resetSession, setResetSession] = React.useState(true);
  const [creating, setCreating] = React.useState(false);
  const [newError, setNewError] = React.useState<string | null>(null);
  const [autoKey, setAutoKey] = React.useState(true);

  const storageKey = 'mc:sessions:lastSeen';
  const [lastSeenMap, setLastSeenMap] = React.useState<Record<string, number>>({});

  const agentIds = React.useMemo(() => {
    const fromPb = agents.map((a) => a.openclawAgentId || a.id).filter(Boolean);
    const fromSessions = rows
      .map((r) => agentIdFromSessionKey(r.sessionKey))
      .filter((v): v is string => Boolean(v));
    const set = new Set([...fromPb, ...fromSessions]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [agents, rows]);

  const defaultSessionKey = React.useCallback((agentId: string) => {
    if (!agentId) return '';
    return `agent:${agentId}:main`;
  }, []);

  React.useEffect(() => {
    if (!newAgent && agentIds.length) {
      setNewAgent(agentIds[0]);
    }
  }, [agentIds, newAgent]);

  React.useEffect(() => {
    if (!autoKey) return;
    if (!newAgent) return;
    setNewSessionKey(defaultSessionKey(newAgent));
  }, [autoKey, newAgent, defaultSessionKey]);

  const filteredRows = React.useMemo(() => {
    const list = [...rows];
    list.sort((a, b) => {
      const ta = a.updatedAt ? Date.parse(a.updatedAt) : 0;
      const tb = b.updatedAt ? Date.parse(b.updatedAt) : 0;
      return tb - ta;
    });
    let out = list;
    if (selectedAgent) {
      const prefix = `agent:${selectedAgent}:`;
      out = out.filter((r) => r.sessionKey.startsWith(prefix));
    }
    if (inboxMode !== 'all') out = out.filter((r) => sessionCategory(r) === inboxMode);
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      out = out.filter((r) => {
        const key = String(r.sessionKey || '').toLowerCase();
        const display = String(r.displayName || '').toLowerCase();
        const channel = String((r as any).channel || '').toLowerCase();
        const model = String(r.model || '').toLowerCase();
        const preview = String(r.previewText || '').toLowerCase();
        return key.includes(q) || display.includes(q) || channel.includes(q) || model.includes(q) || preview.includes(q);
      });
    }
    return out;
  }, [rows, selectedAgent, inboxMode, query]);

  async function refreshSessions() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({ limit: '400', offset: '0', messageLimit: '2' });
      const res = await mcFetch(`/api/openclaw/sessions?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load sessions');
      setRows(json.rows ?? []);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to load sessions');
    } finally {
      setLoading(false);
    }
  }

  async function createSession() {
    const key = newSessionKey.trim();
    if (!key) {
      setNewError('Session key required.');
      return;
    }
    const trimmedMessage = newMessage.trim();
    const message = resetSession ? `/new${trimmedMessage ? `\n${trimmedMessage}` : ''}` : trimmedMessage;
    if (!message) {
      setNewError('Add a message or enable reset.');
      return;
    }
    setCreating(true);
    setNewError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: key, message, timeoutSeconds: 0 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to start session');
      setNewMessage('');
      setNewOpen(false);
      setAutoKey(true);
      await refreshSessions();
      router.push(`/sessions/${encodeURIComponent(key)}`);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setNewError(msg || 'Failed to start session');
    } finally {
      setCreating(false);
    }
  }

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setLastSeenMap(parsed);
      }
    } catch {
      // ignore
    }
    void refreshSessions();
  }, []);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-hidden">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px]">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions, channels, models…"
              className="pl-9"
            />
          </div>
          <div className="min-w-[180px]">
            <select
              value={selectedAgent}
              onChange={(e) => setSelectedAgent(e.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="">All agents</option>
              {agentIds.map((id) => (
                <option key={id} value={id}>
                  {id}
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => {
                setNewOpen((v) => !v);
                setNewError(null);
              }}
            >
              <Plus className="mr-2 h-4 w-4" />
              {newOpen ? 'Close' : 'New session'}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void refreshSessions()} disabled={loading}>
              <RefreshCw className="mr-2 h-4 w-4" />
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          {inboxFilters.map((filter) => {
            const active = filter.id === inboxMode;
            return (
              <button
                key={filter.id}
                type="button"
                onClick={() => setInboxMode(filter.id)}
                className={cn(
                  'rounded-full px-3 py-1.5 text-xs font-semibold transition',
                  active
                    ? 'bg-[var(--accent)] text-[var(--accent-foreground)]'
                    : 'border border-[var(--border)] bg-[var(--surface)] text-[var(--foreground)] hover:bg-[color:var(--foreground)]/5'
                )}
              >
                {filter.label}
              </button>
            );
          })}
        </div>

        {newOpen ? (
          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="grid gap-3 lg:grid-cols-[200px_1fr]">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Agent</label>
                <select
                  value={newAgent}
                  onChange={(e) => {
                    setNewAgent(e.target.value);
                    setAutoKey(true);
                  }}
                  className="mt-2 h-10 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                >
                  {agentIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Session key</label>
                <Input
                  value={newSessionKey}
                  onChange={(e) => {
                    setAutoKey(false);
                    setNewSessionKey(e.target.value);
                  }}
                  placeholder="agent:main:main"
                  className="mt-2"
                />
              </div>
            </div>

            <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
              <div>
                <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Message (optional)</label>
                <Textarea
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Add a first message, or leave empty to just reset."
                  className="mt-2 min-h-[72px]"
                />
              </div>
              <div className="flex flex-col items-start gap-3">
                <label className="flex items-center gap-2 text-xs text-muted">
                  <input type="checkbox" checked={resetSession} onChange={(e) => setResetSession(e.target.checked)} />
                  Start fresh (/new)
                </label>
                <Button size="sm" onClick={() => void createSession()} disabled={creating}>
                  {creating ? 'Starting…' : 'Start session'}
                </Button>
              </div>
            </div>

            {newError ? <div className="mt-2 text-xs text-red-600">{newError}</div> : null}
          </div>
        ) : null}
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div className="flex items-center justify-between border-b border-[var(--border)] px-4 py-3">
          <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Inbox</div>
          <div className="text-xs text-muted">{filteredRows.length} sessions</div>
        </div>
        <div className="min-h-0 flex-1 overflow-auto p-3 mc-scroll">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>
          ) : null}
          {loading ? (
            <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-sm text-muted">Loading…</div>
          ) : null}

          {!loading && !filteredRows.length ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
              No sessions found. Create a task or message an agent to start one.
            </div>
          ) : null}

          <div className="mt-2 space-y-2">
            {filteredRows.map((r) => {
              const info = sessionTitle(r, agents);
              const Icon = sessionIcon(info.icon);
              const when = formatWhen(r.updatedAt);
              const lastSeen = lastSeenMap?.[r.sessionKey] || 0;
              const updatedMs = r.updatedAt ? Date.parse(r.updatedAt) : 0;
              const unread = Boolean(updatedMs && updatedMs > lastSeen);
              const category = sessionCategory(r);
              const badge =
                category === 'mc'
                  ? 'Task'
                  : category === 'dm'
                    ? 'DM'
                    : category === 'group'
                      ? 'Group'
                      : category === 'cron'
                        ? 'Cron'
                        : 'Session';

              return (
                <Link
                  key={r.sessionKey}
                  href={`/sessions/${encodeURIComponent(r.sessionKey)}`}
                  onClick={() => {
                    try {
                      const nextMap = { ...(lastSeenMap || {}), [r.sessionKey]: Date.now() };
                      setLastSeenMap(nextMap);
                      window.localStorage.setItem(storageKey, JSON.stringify(nextMap));
                    } catch {
                      // ignore
                    }
                  }}
                  className="group flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:bg-[color:var(--foreground)]/5"
                >
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                    <Icon className="h-4 w-4 text-[var(--accent)]" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate text-sm font-semibold text-[var(--foreground)]">{info.title}</div>
                      {when ? <div className="shrink-0 text-xs text-muted">{when}</div> : null}
                    </div>
                    <div className="mt-1 flex items-center gap-2 text-xs text-muted">
                      {unread ? <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
                      <span className="truncate">{info.subtitle}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <Badge className="border-none">{badge}</Badge>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export function SessionsThreadClient({
  agents,
  sessionKey,
  initialHistory = [],
  initialError,
}: {
  agents: Agent[];
  sessionKey: string;
  initialHistory?: HistoryRow[];
  initialError?: string | null;
}) {
  const [error, setError] = React.useState<string | null>(initialError || null);
  const [history, setHistory] = React.useState<HistoryRow[]>(initialHistory);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [message, setMessage] = React.useState('');

  const threadRef = React.useRef<HTMLDivElement | null>(null);
  const messageEndRef = React.useRef<HTMLDivElement | null>(null);

  const safeSessionKey = React.useMemo(() => sessionKey.replace(/ /g, '+'), [sessionKey]);

  const selectedRow = React.useMemo<SessionRow | null>(() => {
    return safeSessionKey ? { sessionKey: safeSessionKey } : null;
  }, [safeSessionKey]);

  const label = selectedRow ? sessionTitle(selectedRow, agents) : { title: 'Session', subtitle: '', icon: 'other' };

  async function refreshHistory() {
    if (!safeSessionKey) return;
    setError(null);
    setHistoryLoading(true);
    try {
      const q = new URLSearchParams({
        sessionKey: safeSessionKey,
        limit: '200',
        offset: '0',
        direction: 'backward',
        includeTools: '1',
      });
      const res = await mcFetch(`/api/openclaw/sessions/history?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load history');
      const items = Array.isArray(json.rows) ? json.rows : [];
      setHistory(items.slice().reverse());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Failed to load history');
    } finally {
      setHistoryLoading(false);
    }
  }

  React.useEffect(() => {
    void refreshHistory();
  }, [safeSessionKey]);

  React.useEffect(() => {
    if (!messageEndRef.current) return;
    messageEndRef.current.scrollIntoView({ block: 'end' });
  }, [history.length, safeSessionKey]);

  async function sendMessage() {
    const text = message.trim();
    if (!safeSessionKey || !text) return;
    setSending(true);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: safeSessionKey, message: text, timeoutSeconds: 30 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Send failed');
      setMessage('');
      setTimeout(() => void refreshHistory(), 900);
      setTimeout(() => void refreshHistory(), 2_500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Send failed');
    } finally {
      setSending(false);
    }
  }

  const displayHistory = React.useMemo(() => {
    const hasNonTool = history.some((row) => String((row as any)?.role || '').toLowerCase() !== 'tool');
    if (!hasNonTool) return history;
    return history.filter((row) => String((row as any)?.role || '').toLowerCase() !== 'tool');
  }, [history]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex items-center gap-3">
          <Link
            href="/sessions"
            className="inline-flex items-center gap-2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1.5 text-xs text-muted"
          >
            <ChevronLeft className="h-4 w-4" />
            Inbox
          </Link>
          <div>
            <div className="text-base font-semibold text-[var(--foreground)]">{label.title}</div>
            {label.subtitle ? <div className="text-xs text-muted">{label.subtitle}</div> : null}
          </div>
        </div>
        <button
          type="button"
          onClick={() => void refreshHistory()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-muted transition hover:bg-[color:var(--foreground)]/5"
          aria-label="Refresh history"
        >
          <RefreshCw className="h-4 w-4" />
        </button>
      </header>

      {error ? (
        <div className="border-b border-red-200 bg-red-50 px-4 py-2 text-sm text-red-700">{error}</div>
      ) : null}

      <div ref={threadRef} className="min-h-0 flex-1 overflow-auto bg-[var(--surface)] p-4 mc-scroll">
        {historyLoading ? (
          <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4 text-sm text-muted">Loading…</div>
        ) : null}

        <div className="space-y-3">
          {displayHistory.map((row, idx) => {
            const role = String((row as any)?.role || '').toLowerCase() || 'message';
            const ts = (row as any)?.timestamp ? formatShortDate(String((row as any).timestamp)) : '';
            const text = normalizeMessageText(row as any);
            const isUser = role === 'user';
            const wrapper = isUser ? 'justify-end' : 'justify-start';
            const bubble = isUser
              ? 'border-transparent bg-[var(--chat-user-bg)] text-[var(--chat-user-fg)]'
              : 'border-[var(--border)] bg-[var(--chat-assistant-bg)] text-[var(--chat-assistant-fg)]';
            return (
              <div key={`${(row as any)?.timestamp || ''}-${idx}`} className={cn('flex', wrapper)}>
                <div className={cn('w-full max-w-[min(760px,92%)] rounded-2xl border px-4 py-3 shadow-sm', bubble)}>
                  {ts ? (
                    <div className={cn('mb-2 text-xs', isUser ? 'text-[var(--chat-user-fg)]/70' : 'text-muted')}>
                      {ts}
                    </div>
                  ) : null}
                  <div className={cn('text-sm leading-relaxed', isUser ? 'text-[var(--chat-user-fg)]' : 'text-[var(--chat-assistant-fg)]')}>
                    <div className={cn('prose max-w-none', isUser ? 'text-[var(--chat-user-fg)]' : 'text-[var(--chat-assistant-fg)]')}>
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{text || '(empty)'}</ReactMarkdown>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
          {!displayHistory.length && !historyLoading ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-4 text-sm text-muted">
              No messages yet.
            </div>
          ) : null}
          <div ref={messageEndRef} />
        </div>
      </div>

      <div className="border-t border-[var(--border)] bg-[var(--card)] p-3">
        <div className="relative">
          <Textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
                e.preventDefault();
                void sendMessage();
              }
            }}
            placeholder="Write a message…"
            className="min-h-[72px] pr-14"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !message.trim() || !sessionKey}
            className="absolute bottom-3 right-3 inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm transition hover:bg-[var(--accent-strong)] disabled:opacity-50"
            aria-label="Send message"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
