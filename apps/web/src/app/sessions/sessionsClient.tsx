'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  CalendarClock,
  ChevronLeft,
  Copy,
  Layers,
  ListTodo,
  MessageCircle,
  ArrowUpRight,
  SlidersHorizontal,
  RefreshCw,
  Search,
  Send,
  Trash2,
  Users,
  Bot,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { cn, formatShortDate, titleCase } from '@/lib/utils';
import { mcFetch } from '@/lib/clientApi';
import type { Agent } from '@/lib/types';
import { SessionCreateDrawer } from '@/app/sessions/SessionCreateDrawer';
import { SessionsFilterDrawer } from '@/app/sessions/SessionsFilterDrawer';
import type { InboxMode } from '@/app/sessions/sessionsInboxFilters';

const LAST_SEEN_STORAGE_KEY = 'mc:sessions:lastSeen';

type SessionRow = {
  sessionKey: string;
  kind?: string;
  updatedAt?: string;
  createdAt?: string;
  sessionId?: string;
  model?: string;
  modelProvider?: string;
  thinking?: string;
  verbose?: string;
  reasoning?: string;
  responseUsage?: string;
  elevatedLevel?: string;
  execHost?: string;
  execSecurity?: string;
  execAsk?: string;
  execNode?: string;
  spawnedBy?: string;
  sendPolicy?: string;
  groupActivation?: string;
  systemSent?: boolean;
  abortedLastRun?: boolean;
  messageCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  tokensUsed?: number;
  tokensMax?: number;
  tokensPct?: number;
  transcriptPath?: string;
  channel?: string;
  label?: string;
  displayName?: string;
  deliveryContext?: any;
  lastChannel?: string;
  lastTo?: string;
  lastAccountId?: string;
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
  clientId?: string;
  optimistic?: boolean;
};

function newClientId() {
  try {
    // Best-effort unique id for optimistic rows.
    return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  } catch {
    return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }
}

function agentIdFromSessionKey(sessionKey: string) {
  if (!sessionKey.startsWith('agent:')) return null;
  const parts = sessionKey.split(':');
  if (parts.length < 3) return null;
  return parts[1] || null;
}

function taskIdFromSessionKey(sessionKey: string) {
  const parts = String(sessionKey || '')
    .split(':')
    .filter(Boolean);
  const idx = parts.indexOf('mc');
  if (idx === -1) return '';
  return parts[idx + 1] || '';
}

function isAgentMainSessionKey(sessionKey: string) {
  const parts = String(sessionKey || '')
    .split(':')
    .filter(Boolean);
  return parts.length === 3 && parts[0] === 'agent' && parts[2] === 'main';
}

function normalizeMessageText(row: any): string {
  if (!row) return '';
  if (typeof row.text === 'string') return row.text;
  if (typeof row.message === 'string') return row.message;
  if (typeof row.content === 'string') return row.content;

  if (row.raw && typeof row.raw === 'object') {
    const raw = row.raw as any;
    if (typeof raw.text === 'string') return raw.text;
    if (typeof raw.message === 'string') return raw.message;
    if (typeof raw.content === 'string') return raw.content;
    if (Array.isArray(raw.content)) {
      const texts = raw.content
        .map((c: any) => {
          if (typeof c === 'string') return c;
          if (c && typeof c === 'object' && typeof c.text === 'string') return c.text;
          return '';
        })
        .filter(Boolean);
      if (texts.length) return texts.join('\n');
    }
  }

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

  const sessionLabel = typeof row.label === 'string' ? row.label.trim() : '';
  const channel = row.channel || parts[2] || 'session';

  let identityTitle = '';
  let identitySubtitle = '';
  let icon: 'task' | 'cron' | 'dm' | 'group' | 'main' | 'other' = 'other';

  if (key.includes(':mc:')) {
    const taskId = parts[3] || '';
    identityTitle = `Task ${taskId || 'Mission Control'}`;
    identitySubtitle = agentName;
    icon = 'task';
  } else if (key.includes(':cron:')) {
    const job = parts[3] || '';
    identityTitle = `Cron ${job ? job.slice(0, 8) : 'job'}`;
    identitySubtitle = agentName;
    icon = 'cron';
  } else if (key.includes(':dm:')) {
    const contact = parts.slice(parts.indexOf('dm') + 1).join(':') || row.displayName || 'DM';
    identityTitle = contact;
    identitySubtitle = `${agentName} · ${row.channel || parts[2] || 'dm'}`;
    icon = 'dm';
  } else if (row.kind === 'group' || key.includes(':group:')) {
    const grp = row.displayName || parts.slice(2).join(':') || 'Group';
    identityTitle = grp;
    identitySubtitle = `${agentName} · ${row.channel || parts[2] || 'group'}`;
    icon = 'group';
  } else if (parts.length >= 3 && parts[2] === 'main') {
    identityTitle = `${agentName}`;
    identitySubtitle = 'Main session';
    icon = 'main';
  } else {
    identityTitle = row.displayName || parts.slice(2).join(':') || key;
    identitySubtitle = `${agentName} · ${channel}`;
    icon = 'other';
  }

  if (sessionLabel) {
    const subtitleParts: string[] = [];
    if (identityTitle && identityTitle !== sessionLabel) subtitleParts.push(identityTitle);
    if (identitySubtitle) subtitleParts.push(identitySubtitle);
    return { title: sessionLabel, subtitle: subtitleParts.join(' · '), icon };
  }

  return { title: identityTitle, subtitle: identitySubtitle, icon };
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

async function copyToClipboard(value: string) {
  try {
    await navigator.clipboard.writeText(value);
  } catch {
    // ignore
  }
}

export function SessionsInboxClient({ agents }: { agents: Agent[] }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [rows, setRows] = React.useState<SessionRow[]>([]);
  const [taskMetaById, setTaskMetaById] = React.useState<
    Record<string, { id: string; title: string; status?: string; archived?: boolean }>
  >({});
  const [selectedAgent, setSelectedAgent] = React.useState('');
  const [inboxMode, setInboxMode] = React.useState<InboxMode>('all');
  const [groupBy, setGroupBy] = React.useState<'agent' | 'type'>('agent');
  const [query, setQuery] = React.useState('');
  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [deletingKey, setDeletingKey] = React.useState<string | null>(null);
  const refreshingRef = React.useRef(false);

  const [lastSeenMap, setLastSeenMap] = React.useState<Record<string, number>>({});

  const agentIds = React.useMemo(() => {
    const fromPb = agents.map((a) => a.openclawAgentId || a.id).filter(Boolean);
    const fromSessions = rows
      .map((r) => agentIdFromSessionKey(r.sessionKey))
      .filter((v): v is string => Boolean(v));
    const set = new Set([...fromPb, ...fromSessions]);
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [agents, rows]);

  const agentLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      const id = a.openclawAgentId || a.id;
      if (!id) continue;
      map.set(id, a.displayName || id);
    }
    return map;
  }, [agents]);

  const newParam = searchParams.get('new');
  React.useEffect(() => {
    setCreateOpen(newParam === '1');
  }, [newParam]);

  React.useEffect(() => {
    const raw = searchParams.get('agentId') || searchParams.get('agent') || '';
    const next = String(raw || '').trim();
    if (!next) return;
    setSelectedAgent(next);
  }, [searchParams]);

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
        const label = String((r as any).label || '').toLowerCase();
        const display = String(r.displayName || '').toLowerCase();
        const channel = String((r as any).channel || '').toLowerCase();
        const model = String(r.model || '').toLowerCase();
        const preview = String(r.previewText || '').toLowerCase();
        return (
          key.includes(q) ||
          label.includes(q) ||
          display.includes(q) ||
          channel.includes(q) ||
          model.includes(q) ||
          preview.includes(q)
        );
      });
    }
    return out;
  }, [rows, selectedAgent, inboxMode, query]);

  const taskMetaFetchKeyRef = React.useRef('');

  const refreshTaskMeta = React.useCallback(
    async (nextRows: SessionRow[]) => {
      const ids = Array.from(
        new Set(
          (nextRows ?? [])
            .filter((r) => sessionCategory(r) === 'mc')
            .map((r) => taskIdFromSessionKey(r.sessionKey))
            .filter(Boolean)
        )
      ).sort((a, b) => a.localeCompare(b));

      const key = ids.join(',');
      if (key === taskMetaFetchKeyRef.current) return;
      taskMetaFetchKeyRef.current = key;

      if (!ids.length) {
        setTaskMetaById({});
        return;
      }

      try {
        const res = await mcFetch('/api/tasks/resolve', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
        const json = await res.json().catch(() => null);
        if (!res.ok) return;
        const next = json?.byId && typeof json.byId === 'object' ? json.byId : {};
        setTaskMetaById(next);
      } catch {
        // ignore task title lookup errors (sessions still render)
      }
    },
    [setTaskMetaById]
  );

  const groupedRows = React.useMemo(() => {
    const buckets: Record<InboxMode, SessionRow[]> = {
      all: [],
      mc: [],
      dm: [],
      group: [],
      cron: [],
      other: [],
    };
    for (const row of filteredRows) {
      const bucket = sessionCategory(row);
      buckets[bucket] = [...buckets[bucket], row];
    }
    return buckets;
  }, [filteredRows]);

  const sectionsToRender = React.useMemo(() => {
    if (groupBy === 'agent') {
      const buckets = new Map<string, SessionRow[]>();
      for (const row of filteredRows) {
        const id = agentIdFromSessionKey(row.sessionKey) || 'unknown';
        const list = buckets.get(id) || [];
        list.push(row);
        buckets.set(id, list);
      }

      const sections: Array<{ id: string; label: string; rows: SessionRow[] }> = [];
      for (const id of agentIds) {
        const list = buckets.get(id);
        if (!list || !list.length) continue;
        const label = agentLabelById.get(id);
        const name = label && label !== id ? `${label} (${id})` : id;
        sections.push({ id, label: name, rows: list });
      }

      const unknown = buckets.get('unknown');
      if (unknown && unknown.length) sections.push({ id: 'unknown', label: 'Other', rows: unknown });

      if (!sections.length && buckets.size) {
        const ids = Array.from(buckets.keys()).sort((a, b) => a.localeCompare(b));
        for (const id of ids) {
          const list = buckets.get(id);
          if (!list || !list.length) continue;
          const label = agentLabelById.get(id);
          const name = id === 'unknown' ? 'Other' : label && label !== id ? `${label} (${id})` : id;
          sections.push({ id, label: name, rows: list });
        }
      }

      return sections;
    }

    const sections =
      inboxMode === 'all'
        ? ([
            { id: 'mc', label: 'Mission control' },
            { id: 'dm', label: 'Direct messages' },
            { id: 'group', label: 'Groups' },
            { id: 'cron', label: 'Cron' },
            { id: 'other', label: 'Other' },
          ] as Array<{ id: InboxMode; label: string }>)
        : ([{ id: inboxMode, label: inboxMode }] as Array<{ id: InboxMode; label: string }>);

    return sections
      .map((section) => ({ id: section.id, label: section.label, rows: groupedRows[section.id] ?? [] }))
      .filter((section) => section.rows.length > 0);
  }, [agentIds, agentLabelById, filteredRows, groupBy, groupedRows, inboxMode]);

  const refreshSessions = React.useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    if (refreshingRef.current) return;
    refreshingRef.current = true;
    if (!silent) setLoading(true);
    if (!silent) setError(null);
    try {
      const q = new URLSearchParams({ limit: '400', offset: '0', messageLimit: '2' });
      const res = await mcFetch(`/api/openclaw/sessions?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load sessions');
      const nextRows = json.rows ?? [];
      setRows(nextRows);
      void refreshTaskMeta(nextRows);
    } catch (err: unknown) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Failed to load sessions');
      }
    } finally {
      refreshingRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [refreshTaskMeta]);

  async function deleteSession(sessionKey: string) {
    if (!sessionKey) return;
    if (isAgentMainSessionKey(sessionKey)) {
      setError('Cannot delete the main session.');
      return;
    }
    if (!window.confirm(`Delete session?\n\n${sessionKey}\n\nThis removes it from OpenClaw and archives its transcript(s).`)) {
      return;
    }
    setDeletingKey(sessionKey);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Delete failed');
      try {
        const nextMap = { ...(lastSeenMap || {}) };
        delete nextMap[sessionKey];
        setLastSeenMap(nextMap);
        window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, JSON.stringify(nextMap));
      } catch {
        // ignore
      }
      setRows((prev) => prev.filter((r) => r.sessionKey !== sessionKey));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Delete failed');
    } finally {
      setDeletingKey(null);
    }
  }

  function closeCreateDrawer() {
    setCreateOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    params.delete('new');
    const next = params.toString();
    router.replace(next ? `/sessions?${next}` : '/sessions', { scroll: false });
  }

  React.useEffect(() => {
    try {
      const raw = window.localStorage.getItem(LAST_SEEN_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') setLastSeenMap(parsed);
      }
    } catch {
      // ignore
    }
    void refreshSessions();
  }, [refreshSessions]);

  React.useEffect(() => {
    const id = setInterval(() => {
      void refreshSessions({ silent: true });
    }, 30_000);
    return () => clearInterval(id);
  }, [refreshSessions]);

  const hasActiveFilters = Boolean(query.trim() || selectedAgent || inboxMode !== 'all' || groupBy !== 'agent');

  function resetFilters() {
    setQuery('');
    setSelectedAgent('');
    setInboxMode('all');
    setGroupBy('agent');
  }

  return (
    <>
      <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search sessions…"
              className="pl-9"
            />
          </div>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="h-11 w-11 px-0"
            onClick={() => void refreshSessions()}
            disabled={loading}
            aria-label="Refresh sessions"
            title="Refresh"
          >
            <RefreshCw className={cn('h-4 w-4', loading && 'animate-spin')} />
          </Button>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="relative h-11 w-11 px-0 sm:w-auto sm:px-3"
            onClick={() => setFiltersOpen(true)}
            aria-label="Open filters"
            title="Filters"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Filters</span>
            {hasActiveFilters ? (
              <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-[var(--accent)] ring-2 ring-[var(--surface)]" />
            ) : null}
          </Button>

          <div className="hidden xl:block text-xs text-muted tabular-nums">{filteredRows.length} sessions</div>
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

          <div className="mt-2 space-y-4">
            {sectionsToRender.map((section) => {
              const list = section.rows ?? [];
              if (!list.length) return null;
              const showHeader = groupBy === 'agent' || (groupBy === 'type' && inboxMode === 'all');
              return (
                <div key={section.id}>
                  {showHeader ? (
                    <div className="px-1 text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">{section.label}</div>
                  ) : null}
                  <div className="mt-2 space-y-2">
                    {list.map((r) => {
                      const info = sessionTitle(r, agents);
                      const Icon = sessionIcon(info.icon);
                      const when = formatWhen(r.updatedAt);
                      const lastSeen = lastSeenMap?.[r.sessionKey] || 0;
                      const updatedMs = r.updatedAt ? Date.parse(r.updatedAt) : 0;
                      const unread = Boolean(updatedMs && updatedMs > lastSeen);
                      const category = sessionCategory(r);
                      const linkedTaskId = category === 'mc' ? taskIdFromSessionKey(r.sessionKey) : '';
                      const linkedTask = linkedTaskId ? taskMetaById?.[linkedTaskId] : null;
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
                      const pct =
                        typeof r.tokensPct === 'number'
                          ? r.tokensPct
                          : typeof r.tokensUsed === 'number' && typeof r.tokensMax === 'number' && r.tokensMax > 0
                            ? Math.round((r.tokensUsed / r.tokensMax) * 100)
                            : null;
                      const pctTone =
                        pct !== null && pct >= 90
                          ? 'bg-red-600 text-white border-transparent'
                          : pct !== null && pct >= 80
                            ? 'bg-amber-300 text-amber-950 border-transparent'
                            : 'bg-[var(--highlight)] text-[var(--highlight-foreground)]';

                      const title = linkedTask?.title ? linkedTask.title : info.title;
                      const subtitle = (() => {
                        if (category !== 'mc') return info.subtitle;
                        const status = linkedTask?.status ? titleCase(linkedTask.status) : '';
                        return status ? `${info.subtitle} · ${status}` : info.subtitle;
                      })();

                      return (
                        <div
                          key={r.sessionKey}
                          className="group flex items-start gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 transition hover:bg-[color:var(--foreground)]/5"
                        >
                          <Link
                            href={`/sessions/${encodeURIComponent(r.sessionKey)}`}
                            onClick={() => {
                              try {
                                const nextMap = { ...(lastSeenMap || {}), [r.sessionKey]: Date.now() };
                                setLastSeenMap(nextMap);
                                window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, JSON.stringify(nextMap));
                              } catch {
                                // ignore
                              }
                            }}
                            className="flex min-w-0 flex-1 items-start gap-3"
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-[var(--border)] bg-[var(--card)]">
                              <Icon className="h-4 w-4 text-[var(--accent)]" />
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-start justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="flex items-center gap-2">
                                    {unread ? <span className="h-2 w-2 rounded-full bg-[var(--accent)]" /> : null}
                                    <div className="truncate text-sm font-semibold text-[var(--foreground)]">{title}</div>
                                  </div>
                                  <div className="mt-1 truncate text-xs text-muted">{subtitle}</div>
                                </div>
                                <div className="shrink-0 text-right">
                                  {when ? <div className="text-xs text-muted">{when}</div> : null}
                                  <div className="mt-1 flex flex-wrap items-center justify-end gap-2">
                                    <Badge className="border-none">{badge}</Badge>
                                    {typeof pct === 'number' ? (
                                      <Badge className={cn('border-none', pctTone)}>{pct}%</Badge>
                                    ) : null}
                                  </div>
                                </div>
                              </div>
                              {r.previewText ? (
                                <div className="mt-2 line-clamp-2 text-xs text-[var(--foreground)]/80">{r.previewText}</div>
                              ) : null}
                              {r.model ? (
                                <div className="mt-2 flex items-center gap-2 text-[11px] text-muted">
                                  <span className="truncate">{r.model}</span>
                                </div>
                              ) : null}
                            </div>
                          </Link>

                          <div className="flex shrink-0 flex-row gap-2 opacity-100 transition sm:flex-col sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                            {linkedTaskId ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-9 w-9 px-0"
                                onClick={() => router.push(`/tasks?task=${encodeURIComponent(linkedTaskId)}`)}
                                aria-label="Open linked task"
                                title="Open linked task"
                              >
                                <ArrowUpRight className="h-4 w-4" />
                              </Button>
                            ) : null}
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-9 w-9 px-0"
                              onClick={() => void copyToClipboard(r.sessionKey)}
                              aria-label="Copy session key"
                            >
                              <Copy className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="secondary"
                              className="h-9 w-9 px-0 text-red-600 hover:text-red-700"
                              onClick={() => void deleteSession(r.sessionKey)}
                              disabled={deletingKey === r.sessionKey || isAgentMainSessionKey(r.sessionKey)}
                              aria-label="Delete session"
                              title={isAgentMainSessionKey(r.sessionKey) ? 'Main sessions cannot be deleted.' : undefined}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      <SessionsFilterDrawer
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        loading={loading}
        onRefresh={() => void refreshSessions()}
        query={query}
        onQueryChange={setQuery}
        selectedAgent={selectedAgent}
        onSelectedAgentChange={setSelectedAgent}
        agentIds={agentIds}
        agentLabelById={agentLabelById}
        inboxMode={inboxMode}
        onInboxModeChange={setInboxMode}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        hasActiveFilters={hasActiveFilters}
        onReset={resetFilters}
      />

      <SessionCreateDrawer open={createOpen} agents={agents} onClose={closeCreateDrawer} defaultAgentId={selectedAgent} />
    </>
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
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(initialError || null);
  const [history, setHistory] = React.useState<HistoryRow[]>(initialHistory);
  const [historyLoading, setHistoryLoading] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const [message, setMessage] = React.useState('');
  const [showTools, setShowTools] = React.useState(false);
  const [autoRefresh, setAutoRefresh] = React.useState(true);
  const [inspectorOpen, setInspectorOpen] = React.useState(false);
  const INSPECTOR_TRANSITION_MS = 220;
  const [inspectorRendered, setInspectorRendered] = React.useState(inspectorOpen);
  const [inspectorVisible, setInspectorVisible] = React.useState(inspectorOpen);

  const [sessionInfo, setSessionInfo] = React.useState<SessionRow | null>(null);
  const [infoLoading, setInfoLoading] = React.useState(false);
  const [infoError, setInfoError] = React.useState<string | null>(null);
  const [patching, setPatching] = React.useState(false);

  const [statusText, setStatusText] = React.useState<string | null>(null);
  const [statusLoading, setStatusLoading] = React.useState(false);
  const [statusError, setStatusError] = React.useState<string | null>(null);

  const [labelDraft, setLabelDraft] = React.useState('');
  const [labelDirty, setLabelDirty] = React.useState(false);

  const [execNodeDraft, setExecNodeDraft] = React.useState('');
  const [execNodeDirty, setExecNodeDirty] = React.useState(false);

  const [modelDraft, setModelDraft] = React.useState('');
  const [modelCatalog, setModelCatalog] = React.useState<Array<{ key: string; name?: string }> | null>(null);
  const [modelCatalogLoading, setModelCatalogLoading] = React.useState(false);
  const [modelCatalogError, setModelCatalogError] = React.useState<string | null>(null);
  const modelCatalogLoadingRef = React.useRef(false);

  const [memoryQuery, setMemoryQuery] = React.useState('');
  const [memoryResults, setMemoryResults] = React.useState<any[]>([]);
  const [memoryLoading, setMemoryLoading] = React.useState(false);
  const [memoryError, setMemoryError] = React.useState<string | null>(null);
  const [memoryStatus, setMemoryStatus] = React.useState<any>(null);
  const [memoryStatusLoading, setMemoryStatusLoading] = React.useState(false);
  const [memoryIndexing, setMemoryIndexing] = React.useState(false);
  const [memoryReadMap, setMemoryReadMap] = React.useState<Record<string, { loading: boolean; text?: string; error?: string }>>({});

  const [spawnTask, setSpawnTask] = React.useState('');
  const [spawnLabel, setSpawnLabel] = React.useState('');
  const [spawnAgentId, setSpawnAgentId] = React.useState('');
  const [spawnThinking, setSpawnThinking] = React.useState('default');
  const [spawnModel, setSpawnModel] = React.useState('');
  const [spawnCleanup, setSpawnCleanup] = React.useState<'keep' | 'delete'>('keep');
  const [spawnTimeoutSeconds, setSpawnTimeoutSeconds] = React.useState(0);
  const [spawning, setSpawning] = React.useState(false);
  const [spawnError, setSpawnError] = React.useState<string | null>(null);
  const [spawnResult, setSpawnResult] = React.useState<any>(null);

  const threadRef = React.useRef<HTMLDivElement | null>(null);
  const messageEndRef = React.useRef<HTMLDivElement | null>(null);
  const composerRef = React.useRef<HTMLTextAreaElement | null>(null);

  const safeSessionKey = React.useMemo(() => sessionKey.replace(/ /g, '+'), [sessionKey]);
  const agentId = React.useMemo(() => agentIdFromSessionKey(safeSessionKey) || '', [safeSessionKey]);
  const linkedTaskId = React.useMemo(() => taskIdFromSessionKey(safeSessionKey) || '', [safeSessionKey]);
  const [linkedTask, setLinkedTask] = React.useState<{ id: string; title: string; status?: string } | null>(null);

  const allAgentIds = React.useMemo(() => {
    const set = new Set<string>();
    for (const a of agents) {
      const id = a.openclawAgentId || a.id;
      if (id && id.trim()) set.add(id.trim());
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [agents]);

  const agentLabelById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const a of agents) {
      const id = a.openclawAgentId || a.id;
      if (!id || !id.trim()) continue;
      const display = a.displayName?.trim() || '';
      map.set(id.trim(), display || id.trim());
    }
    return map;
  }, [agents]);

  const selectedRow = React.useMemo<SessionRow | null>(() => {
    return safeSessionKey ? { sessionKey: safeSessionKey } : null;
  }, [safeSessionKey]);

  const headerRow = sessionInfo ?? selectedRow;
  const label = headerRow ? sessionTitle(headerRow, agents) : { title: 'Session', subtitle: '', icon: 'other' };

  const refreshHistory = React.useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    if (!safeSessionKey) return;
    if (!silent) setError(null);
    if (!silent) setHistoryLoading(true);
    try {
      const q = new URLSearchParams({
        sessionKey: safeSessionKey,
        limit: '200',
        includeTools: showTools ? '1' : '0',
      });
      const res = await mcFetch(`/api/openclaw/sessions/history?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load history');
      const items = Array.isArray(json.rows) ? json.rows : [];
      setHistory(items);
    } catch (err: unknown) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg || 'Failed to load history');
      }
    } finally {
      if (!silent) setHistoryLoading(false);
    }
  }, [safeSessionKey, showTools]);

  const refreshSessionInfo = React.useCallback(async ({ silent }: { silent?: boolean } = {}) => {
    if (!safeSessionKey) return;
    if (!silent) setInfoError(null);
    if (!silent) setInfoLoading(true);
    try {
      const q = new URLSearchParams({ sessionKey: safeSessionKey });
      const res = await mcFetch(`/api/openclaw/sessions/entry?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load session');
      setSessionInfo(json?.row ?? null);
    } catch (err: unknown) {
      if (!silent) {
        const msg = err instanceof Error ? err.message : String(err);
        setInfoError(msg || 'Failed to load session');
        setSessionInfo(null);
      }
    } finally {
      if (!silent) setInfoLoading(false);
    }
  }, [safeSessionKey]);

  React.useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  React.useEffect(() => {
    void refreshSessionInfo();
  }, [refreshSessionInfo]);

  React.useEffect(() => {
    if (!linkedTaskId) {
      setLinkedTask(null);
      return;
    }
    let cancelled = false;
    mcFetch(`/api/tasks/${encodeURIComponent(linkedTaskId)}`, { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.id) {
          setLinkedTask(null);
          return;
        }
        setLinkedTask({
          id: String(json.id),
          title: String(json.title || json.id),
          status: typeof json.status === 'string' ? json.status : undefined,
        });
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, [linkedTaskId]);

  React.useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      try {
        if (document.visibilityState !== 'visible') return;
      } catch {
        // ignore
      }
      void refreshHistory({ silent: true });
      void refreshSessionInfo({ silent: true });
    }, 10_000);
    return () => clearInterval(id);
  }, [autoRefresh, refreshHistory, refreshSessionInfo]);

  React.useEffect(() => {
    setLabelDraft('');
    setLabelDirty(false);
    setExecNodeDraft('');
    setExecNodeDirty(false);
    setModelDraft('');
    setStatusText(null);
    setStatusError(null);
    setMemoryStatus(null);
    setMemoryReadMap({});
    setSpawnTask('');
    setSpawnLabel('');
    setSpawnThinking('default');
    setSpawnModel('');
    setSpawnCleanup('keep');
    setSpawnTimeoutSeconds(0);
    setSpawning(false);
    setSpawnError(null);
    setSpawnResult(null);
    setSpawnAgentId(agentIdFromSessionKey(safeSessionKey) || '');
  }, [safeSessionKey]);

  React.useEffect(() => {
    if (labelDirty) return;
    const next = typeof sessionInfo?.label === 'string' ? sessionInfo.label : '';
    setLabelDraft(next);
  }, [labelDirty, sessionInfo?.label]);

  React.useEffect(() => {
    if (execNodeDirty) return;
    const next = typeof sessionInfo?.execNode === 'string' ? sessionInfo.execNode : '';
    setExecNodeDraft(next);
  }, [execNodeDirty, sessionInfo?.execNode]);

  const refreshStatus = React.useCallback(async () => {
    if (!safeSessionKey) return;
    setStatusError(null);
    setStatusLoading(true);
    try {
      const q = new URLSearchParams({ sessionKey: safeSessionKey });
      const res = await mcFetch(`/api/openclaw/sessions/status?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load status');
      const text = typeof json?.statusText === 'string' ? json.statusText : null;
      setStatusText(text);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setStatusError(msg || 'Failed to load status');
      setStatusText(null);
    } finally {
      setStatusLoading(false);
    }
  }, [safeSessionKey]);

  const loadModels = React.useCallback(async () => {
    if (modelCatalogLoadingRef.current) return;
    modelCatalogLoadingRef.current = true;
    setModelCatalogError(null);
    setModelCatalogLoading(true);
    try {
      const res = await mcFetch('/api/openclaw/models/list', { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load models');
      const models = Array.isArray(json?.models) ? (json.models as any[]) : [];
      const rows = models
        .map((m) => {
          const key = typeof m?.key === 'string' ? m.key.trim() : '';
          const name = typeof m?.name === 'string' ? m.name.trim() : '';
          if (!key) return null;
          return { key, name: name || undefined };
        })
        .filter(Boolean) as Array<{ key: string; name?: string }>;
      rows.sort((a, b) => a.key.localeCompare(b.key));
      setModelCatalog(rows);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setModelCatalogError(msg || 'Failed to load models');
      setModelCatalog(null);
    } finally {
      modelCatalogLoadingRef.current = false;
      setModelCatalogLoading(false);
    }
  }, []);

  // Closing the drawer on session switches prevents "stale details" when navigating quickly.
  React.useEffect(() => {
    setInspectorOpen(false);
  }, [safeSessionKey]);

  React.useEffect(() => {
    if (!inspectorOpen) return;
    void refreshStatus();
  }, [inspectorOpen, refreshStatus]);

  React.useEffect(() => {
    if (!inspectorOpen) return;
    if (modelCatalog && modelCatalog.length) return;
    void loadModels();
  }, [inspectorOpen, modelCatalog, loadModels]);

  // Opening: render immediately (before paint) and then slide in on the next frame.
  React.useLayoutEffect(() => {
    if (inspectorOpen) {
      setInspectorRendered(true);
      setInspectorVisible(false);
      const raf = requestAnimationFrame(() => setInspectorVisible(true));
      return () => cancelAnimationFrame(raf);
    }
  }, [inspectorOpen]);

  // Closing: allow one paint with the drawer visible, then slide out and unmount.
  React.useEffect(() => {
    if (inspectorOpen) return;
    setInspectorVisible(false);
    const timeout = setTimeout(() => setInspectorRendered(false), INSPECTOR_TRANSITION_MS);
    return () => clearTimeout(timeout);
  }, [inspectorOpen, INSPECTOR_TRANSITION_MS]);

  React.useEffect(() => {
    if (!inspectorRendered) return;

    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    const scrollBarWidth = window.innerWidth - document.documentElement.clientWidth;

    document.body.style.overflow = 'hidden';
    if (scrollBarWidth > 0) document.body.style.paddingRight = `${scrollBarWidth}px`;

    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
    };
  }, [inspectorRendered]);

  React.useEffect(() => {
    if (!inspectorRendered) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setInspectorOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [inspectorRendered]);

  React.useEffect(() => {
    if (!safeSessionKey) return;
    try {
      const raw = window.localStorage.getItem(LAST_SEEN_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      const nextMap = parsed && typeof parsed === 'object' ? { ...parsed } : {};
      nextMap[safeSessionKey] = Date.now();
      window.localStorage.setItem(LAST_SEEN_STORAGE_KEY, JSON.stringify(nextMap));
    } catch {
      // ignore
    }
  }, [safeSessionKey]);

  async function patchSession(patch: {
    label?: string;
    thinkingLevel?: string;
    verboseLevel?: string;
    reasoningLevel?: string;
    responseUsage?: string;
    elevatedLevel?: string;
    execHost?: string;
    execSecurity?: string;
    execAsk?: string;
    execNode?: string;
    sendPolicy?: string;
    groupActivation?: string;
  }) {
    if (!safeSessionKey) return;
    setPatching(true);
    setInfoError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/patch', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: safeSessionKey, ...patch }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to update session');
      await refreshSessionInfo();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInfoError(msg || 'Failed to update session');
    } finally {
      setPatching(false);
    }
  }

  async function setModelOverride(nextModel: string) {
    const v = String(nextModel || '').trim();
    if (!safeSessionKey) return;
    if (!v) {
      setInfoError('Model required (use "default" to clear).');
      return;
    }
    setPatching(true);
    setInfoError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/status', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: safeSessionKey, model: v }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to set model');
      await refreshSessionInfo();
      await refreshStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInfoError(msg || 'Failed to set model');
    } finally {
      setPatching(false);
    }
  }

  async function resetViaGateway() {
    if (!safeSessionKey) return;
    if (
      !window.confirm(
        `Reset this session?\n\n${safeSessionKey}\n\nThis starts a fresh transcript for the same session key.`
      )
    ) {
      return;
    }
    setPatching(true);
    setInfoError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/reset', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: safeSessionKey }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Reset failed');
      setTimeout(() => void refreshHistory(), 700);
      setTimeout(() => void refreshHistory(), 2_000);
      setTimeout(() => void refreshSessionInfo(), 1_200);
      await refreshStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInfoError(msg || 'Reset failed');
    } finally {
      setPatching(false);
    }
  }

  async function hardCompactTranscript() {
    if (!safeSessionKey) return;
    if (
      !window.confirm(
        `Trim transcript to the last ~400 lines?\n\n${safeSessionKey}\n\nThis is a hard truncate (sessions.compact). It is NOT the AI summarization compaction.`
      )
    ) {
      return;
    }
    setPatching(true);
    setInfoError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/compact', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: safeSessionKey, maxLines: 400 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Compact failed');
      setTimeout(() => void refreshHistory(), 700);
      setTimeout(() => void refreshHistory(), 2_000);
      setTimeout(() => void refreshSessionInfo(), 1_200);
      await refreshStatus();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInfoError(msg || 'Compact failed');
    } finally {
      setPatching(false);
    }
  }

  async function spawnSubagent() {
    const task = spawnTask.trim();
    if (!safeSessionKey || !task) return;
    setSpawning(true);
    setSpawnError(null);
    setSpawnResult(null);
    try {
      const payload: Record<string, unknown> = {
        sessionKey: safeSessionKey,
        task,
        cleanup: spawnCleanup,
      };
      if (spawnLabel.trim()) payload.label = spawnLabel.trim();
      if (spawnAgentId.trim()) payload.agentId = spawnAgentId.trim();
      if (spawnModel.trim()) payload.model = spawnModel.trim();
      if (spawnThinking.trim() && spawnThinking !== 'default') payload.thinking = spawnThinking.trim();
      if (spawnTimeoutSeconds > 0) payload.timeoutSeconds = spawnTimeoutSeconds;

      const res = await mcFetch('/api/openclaw/sessions/spawn', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Spawn failed');

      setSpawnResult(json?.result ?? json);
      setSpawnTask('');

      // The tool announces back into this chat asynchronously; give it a few refreshes.
      setTimeout(() => void refreshHistory(), 1_000);
      setTimeout(() => void refreshHistory(), 3_000);
      setTimeout(() => void refreshHistory(), 7_000);
      setTimeout(() => void refreshHistory(), 15_000);
      setTimeout(() => void refreshSessionInfo(), 1_500);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSpawnError(msg || 'Spawn failed');
    } finally {
      setSpawning(false);
    }
  }

  async function deleteCurrentSession() {
    if (!safeSessionKey) return;
    if (isAgentMainSessionKey(safeSessionKey)) {
      setInfoError('Cannot delete the main session.');
      return;
    }
    if (
      !window.confirm(
        `Delete session?\n\n${safeSessionKey}\n\nThis removes it from OpenClaw and archives its transcript(s).`
      )
    ) {
      return;
    }
    setPatching(true);
    setInfoError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: safeSessionKey }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Delete failed');
      router.replace('/sessions');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setInfoError(msg || 'Delete failed');
    } finally {
      setPatching(false);
    }
  }

  async function sendCommand(text: string, { confirmText }: { confirmText?: string } = {}) {
    const trimmed = text.trim();
    if (!safeSessionKey || !trimmed) return;
    if (confirmText && !window.confirm(confirmText)) return;
    setSending(true);
    setError(null);
    try {
      const res = await mcFetch('/api/openclaw/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: safeSessionKey, message: trimmed, timeoutSeconds: 0 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Send failed');
      setTimeout(() => void refreshHistory(), 700);
      setTimeout(() => void refreshHistory(), 2_000);
      setTimeout(() => void refreshSessionInfo(), 1_200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Send failed');
    } finally {
      setSending(false);
    }
  }

  async function searchMemory() {
    const q = memoryQuery.trim();
    if (!q) return;
    if (!agentId) {
      setMemoryError('Memory search is only available for agent:* sessions.');
      return;
    }
    setMemoryLoading(true);
    setMemoryError(null);
    try {
      const qs = new URLSearchParams({ q, agent: agentId, maxResults: '8', minScore: '0' });
      const res = await mcFetch(`/api/openclaw/memory/search?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Memory search failed');
      const result = json?.result;
      const results = result?.results;
      setMemoryResults(Array.isArray(results) ? results : []);
      if (result?.disabled && typeof result?.error === 'string' && result.error.trim()) {
        setMemoryError(result.error.trim());
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMemoryError(msg || 'Memory search failed');
      setMemoryResults([]);
    } finally {
      setMemoryLoading(false);
    }
  }

  async function loadMemoryStatus({ deep }: { deep?: boolean } = {}) {
    if (!agentId) {
      setMemoryError('Memory status is only available for agent:* sessions.');
      return;
    }
    setMemoryStatusLoading(true);
    setMemoryError(null);
    try {
      const qs = new URLSearchParams({ agent: agentId, deep: deep ? '1' : '0' });
      const res = await mcFetch(`/api/openclaw/memory/status?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Memory status failed');
      setMemoryStatus(json?.result ?? json?.raw ?? null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMemoryError(msg || 'Memory status failed');
      setMemoryStatus(null);
    } finally {
      setMemoryStatusLoading(false);
    }
  }

  async function reindexMemory({ force }: { force?: boolean } = {}) {
    if (!agentId) {
      setMemoryError('Memory indexing is only available for agent:* sessions.');
      return;
    }
    if (
      !window.confirm(
        `Reindex memory for agent "${agentId}"?\n\nThis can take a while and may hit embedding providers.`
      )
    ) {
      return;
    }
    setMemoryIndexing(true);
    setMemoryError(null);
    try {
      const res = await mcFetch('/api/openclaw/memory/index', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ agentId, force: Boolean(force) }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Memory reindex failed');
      setMemoryStatus(json);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMemoryError(msg || 'Memory reindex failed');
    } finally {
      setMemoryIndexing(false);
    }
  }

  async function readMemory(path: string, { from, lines }: { from?: number; lines?: number } = {}) {
    const relPath = String(path || '').trim();
    if (!relPath) return;
    if (!safeSessionKey) return;

    setMemoryReadMap((prev) => ({ ...(prev || {}), [relPath]: { loading: true } }));
    try {
      const qs = new URLSearchParams({ sessionKey: safeSessionKey, path: relPath });
      if (typeof from === 'number' && Number.isFinite(from)) qs.set('from', String(from));
      if (typeof lines === 'number' && Number.isFinite(lines)) qs.set('lines', String(lines));
      const res = await mcFetch(`/api/openclaw/memory/get?${qs.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Memory read failed');
      const result = json?.result;
      const text = typeof result?.text === 'string' ? result.text : typeof result?.result?.text === 'string' ? result.result.text : '';
      const err =
        result?.disabled && typeof result?.error === 'string' && result.error.trim() ? result.error.trim() : undefined;
      setMemoryReadMap((prev) => ({
        ...(prev || {}),
        [relPath]: { loading: false, text: text || '', error: err },
      }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setMemoryReadMap((prev) => ({ ...(prev || {}), [relPath]: { loading: false, error: msg || 'Memory read failed' } }));
    }
  }

  React.useEffect(() => {
    if (!messageEndRef.current) return;
    messageEndRef.current.scrollIntoView({ block: 'end' });
  }, [history.length, safeSessionKey]);

  async function sendMessage() {
    if (sending) return;
    const raw = message;
    const text = raw.trim();
    if (!safeSessionKey || !text) return;

    const optimisticId = newClientId();
    const optimisticRow: HistoryRow = {
      clientId: optimisticId,
      optimistic: true,
      role: 'user',
      timestamp: new Date().toISOString(),
      text,
    };

    setSending(true);
    setError(null);
    // Clear immediately so the text doesn't "stick" in the composer while the network call is inflight.
    setMessage('');
    setHistory((prev) => [...(prev || []), optimisticRow]);
    requestAnimationFrame(() => composerRef.current?.focus());
    try {
      const res = await mcFetch('/api/openclaw/sessions/send', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ sessionKey: safeSessionKey, message: text, timeoutSeconds: 30 }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Send failed');
      void refreshHistory({ silent: true });
      setTimeout(() => void refreshHistory({ silent: true }), 900);
      setTimeout(() => void refreshHistory({ silent: true }), 2_500);
      setTimeout(() => void refreshSessionInfo(), 1_200);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setError(msg || 'Send failed');
      // If we truly failed, remove the optimistic row and restore the draft if the user hasn't typed something new.
      setHistory((prev) => (prev || []).filter((row) => row?.clientId !== optimisticId));
      setMessage((current) => (current && current.trim() ? current : raw));
      requestAnimationFrame(() => composerRef.current?.focus());
    } finally {
      setSending(false);
    }
  }

  const displayHistory = React.useMemo(() => {
    if (showTools) return history;
    return history.filter((row) => {
      const role = String((row as any)?.role || '').toLowerCase();
      if (role !== 'tool') return true;
      const text = normalizeMessageText(row as any);
      return Boolean(text && text.trim());
    });
  }, [history, showTools]);

  const tokensUsed = typeof sessionInfo?.tokensUsed === 'number' ? sessionInfo.tokensUsed : null;
  const tokensMax = typeof sessionInfo?.tokensMax === 'number' ? sessionInfo.tokensMax : null;
  const tokensPct =
    typeof sessionInfo?.tokensPct === 'number'
      ? sessionInfo.tokensPct
      : tokensUsed !== null && tokensMax !== null && tokensMax > 0
        ? Math.round((tokensUsed / tokensMax) * 100)
        : null;
  const tokensPctClamped = typeof tokensPct === 'number' ? Math.max(0, Math.min(100, tokensPct)) : null;
  const thinkingValue = typeof sessionInfo?.thinking === 'string' && sessionInfo.thinking.trim() ? sessionInfo.thinking.trim() : 'default';
  const verboseValue = typeof sessionInfo?.verbose === 'string' && sessionInfo.verbose.trim() ? sessionInfo.verbose.trim() : 'default';
  const reasoningValue =
    typeof sessionInfo?.reasoning === 'string' && sessionInfo.reasoning.trim() ? sessionInfo.reasoning.trim() : 'default';
  const responseUsageValue =
    typeof sessionInfo?.responseUsage === 'string' && sessionInfo.responseUsage.trim()
      ? sessionInfo.responseUsage.trim()
      : 'default';
  const elevatedValue =
    typeof sessionInfo?.elevatedLevel === 'string' && sessionInfo.elevatedLevel.trim()
      ? sessionInfo.elevatedLevel.trim()
      : 'default';
  const execHostValue =
    typeof sessionInfo?.execHost === 'string' && sessionInfo.execHost.trim() ? sessionInfo.execHost.trim() : 'default';
  const execSecurityValue =
    typeof sessionInfo?.execSecurity === 'string' && sessionInfo.execSecurity.trim()
      ? sessionInfo.execSecurity.trim()
      : 'default';
  const execAskValue =
    typeof sessionInfo?.execAsk === 'string' && sessionInfo.execAsk.trim() ? sessionInfo.execAsk.trim() : 'default';
  const execNodeValue =
    typeof sessionInfo?.execNode === 'string' && sessionInfo.execNode.trim() ? sessionInfo.execNode.trim() : '';
  const sendPolicyValue =
    typeof sessionInfo?.sendPolicy === 'string' && sessionInfo.sendPolicy.trim() ? sessionInfo.sendPolicy.trim() : 'default';
  const groupActivationValue =
    typeof sessionInfo?.groupActivation === 'string' && sessionInfo.groupActivation.trim()
      ? sessionInfo.groupActivation.trim()
      : 'default';

  const inspectorPanels = (
    <div className="space-y-4">
      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <div className="flex items-center justify-between gap-2">
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Session</div>
            <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">Inspector</div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 w-9 px-0"
              onClick={() => void copyToClipboard(safeSessionKey)}
              aria-label="Copy session key"
              disabled={!safeSessionKey}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="h-9 w-9 px-0 text-red-600 hover:text-red-700"
              onClick={() => void deleteCurrentSession()}
              aria-label="Delete session"
              disabled={patching || !safeSessionKey || isAgentMainSessionKey(safeSessionKey)}
              title={isAgentMainSessionKey(safeSessionKey) ? 'Main sessions cannot be deleted.' : undefined}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {infoError ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{infoError}</div>
        ) : null}
        {infoLoading ? (
          <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
            Loading session…
          </div>
        ) : null}

        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Key</div>
          <div className="mt-1 truncate font-mono text-xs text-[var(--foreground)]">{safeSessionKey}</div>
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Status</div>
            <Button type="button" size="sm" variant="secondary" onClick={() => void refreshStatus()} disabled={statusLoading}>
              {statusLoading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </div>
          {statusError ? (
            <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{statusError}</div>
          ) : null}
          {statusText ? (
            <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 font-mono text-[11px] leading-relaxed text-[var(--foreground)]">
              {statusText}
            </pre>
          ) : (
            <div className="mt-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--card)] p-3 text-xs text-muted">
              No status loaded yet.
            </div>
          )}
        </div>

        <div className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between gap-2">
            <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Context</div>
            {typeof tokensPct === 'number' ? (
              <Badge
                className={cn(
                  'border-none',
                  tokensPct >= 90 ? 'bg-red-600 text-white' : tokensPct >= 80 ? 'bg-amber-300 text-amber-950' : ''
                )}
              >
                {tokensPct}%
              </Badge>
            ) : (
              <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">—</Badge>
            )}
          </div>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full border border-[var(--border)] bg-[var(--card)]">
            <div
              className="h-full bg-[var(--accent)] transition-[width] duration-200"
              style={{ width: typeof tokensPctClamped === 'number' ? `${tokensPctClamped}%` : '0%' }}
            />
          </div>
          <div className="mt-2 truncate text-xs text-muted">
            Used/Max:{' '}
            <span className="font-mono text-[var(--foreground)]">
              {tokensUsed ?? '—'} / {tokensMax ?? '—'}
            </span>
          </div>
          {sessionInfo?.model ? (
            <div className="mt-2 truncate text-xs text-muted">
              Model: <span className="font-mono text-[var(--foreground)]">{sessionInfo.model}</span>
            </div>
          ) : null}
          {sessionInfo?.sessionId ? (
            <div className="mt-2 truncate text-xs text-muted">
              SessionId: <span className="font-mono text-[var(--foreground)]">{sessionInfo.sessionId}</span>
            </div>
          ) : null}
          {sessionInfo?.kind || sessionInfo?.channel ? (
            <div className="mt-2 truncate text-xs text-muted">
              Kind/Channel:{' '}
              <span className="font-mono text-[var(--foreground)]">
                {sessionInfo.kind || '—'} / {sessionInfo.channel || '—'}
              </span>
            </div>
          ) : null}
          {sessionInfo?.lastTo ? (
            <div className="mt-2 truncate text-xs text-muted">
              Last to: <span className="font-mono text-[var(--foreground)]">{sessionInfo.lastTo}</span>
            </div>
          ) : null}
          {sessionInfo?.lastAccountId ? (
            <div className="mt-2 truncate text-xs text-muted">
              Account: <span className="font-mono text-[var(--foreground)]">{sessionInfo.lastAccountId}</span>
            </div>
          ) : null}
          {typeof sessionInfo?.inputTokens === 'number' || typeof sessionInfo?.outputTokens === 'number' ? (
            <div className="mt-2 truncate text-xs text-muted">
              In/Out:{' '}
              <span className="font-mono text-[var(--foreground)]">
                {typeof sessionInfo?.inputTokens === 'number' ? sessionInfo.inputTokens : '—'} /{' '}
                {typeof sessionInfo?.outputTokens === 'number' ? sessionInfo.outputTokens : '—'}
              </span>
            </div>
          ) : null}
          {typeof sessionInfo?.systemSent === 'boolean' || typeof sessionInfo?.abortedLastRun === 'boolean' ? (
            <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
              {typeof sessionInfo?.systemSent === 'boolean' ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5">
                  system: <span className="font-mono text-[var(--foreground)]">{sessionInfo.systemSent ? 'sent' : 'pending'}</span>
                </span>
              ) : null}
              {typeof sessionInfo?.abortedLastRun === 'boolean' ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--card)] px-2 py-0.5">
                  last run: <span className="font-mono text-[var(--foreground)]">{sessionInfo.abortedLastRun ? 'aborted' : 'ok'}</span>
                </span>
              ) : null}
            </div>
          ) : null}
          {sessionInfo?.transcriptPath ? (
            <div className="mt-2 truncate text-xs text-muted">
              Transcript: <span className="font-mono text-[var(--foreground)]">{sessionInfo.transcriptPath}</span>
            </div>
          ) : null}
        </div>

        <div className="mt-3 grid gap-3">
          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-muted">
            <span className="font-semibold uppercase tracking-[0.14em]">Show tool outputs</span>
            <input type="checkbox" checked={showTools} onChange={(e) => setShowTools(e.target.checked)} />
          </label>

          <label className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-xs text-muted">
            <span className="font-semibold uppercase tracking-[0.14em]">Auto refresh</span>
            <input type="checkbox" checked={autoRefresh} onChange={(e) => setAutoRefresh(e.target.checked)} />
          </label>

          <div className="grid gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Thinking</label>
            <select
              value={thinkingValue}
              onChange={(e) => {
                const next = e.target.value;
                if (next === thinkingValue) return;
                void patchSession({ thinkingLevel: next });
              }}
              disabled={patching}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="default">default</option>
              <option value="off">off</option>
              <option value="minimal">minimal</option>
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
              <option value="max">max</option>
              <option value="xhigh">xhigh</option>
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Verbose</label>
            <select
              value={verboseValue}
              onChange={(e) => {
                const next = e.target.value;
                if (next === verboseValue) return;
                void patchSession({ verboseLevel: next });
              }}
              disabled={patching}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="default">default</option>
              <option value="on">on</option>
              <option value="off">off</option>
            </select>
          </div>
        </div>

        <div className="mt-3 grid gap-2">
          <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Label</label>
          <div className="flex items-center gap-2">
            <Input
              value={labelDraft}
              onChange={(e) => {
                setLabelDirty(true);
                setLabelDraft(e.target.value);
              }}
              placeholder="Optional label (shown in inbox)"
            />
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                void (async () => {
                  const next = labelDraft.trim();
                  await patchSession({ label: next ? next : 'default' });
                  setLabelDirty(false);
                })()
              }
              disabled={patching}
            >
              Save
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              onClick={() =>
                void (async () => {
                  setLabelDraft('');
                  await patchSession({ label: 'default' });
                  setLabelDirty(false);
                })()
              }
              disabled={patching}
            >
              Clear
            </Button>
          </div>
          <div className="text-xs text-muted">Backed by OpenClaw `sessions.patch` → `label` (use default to clear).</div>
        </div>

        <details className="mt-3 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-muted">Advanced</summary>
          <div className="mt-3 grid gap-3">
            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Reasoning</label>
              <select
                value={reasoningValue}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === reasoningValue) return;
                  void patchSession({ reasoningLevel: next });
                }}
                disabled={patching}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="default">default</option>
                <option value="off">off</option>
                <option value="on">on</option>
                <option value="stream">stream</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Response Usage</label>
              <select
                value={responseUsageValue}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === responseUsageValue) return;
                  void patchSession({ responseUsage: next });
                }}
                disabled={patching}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="default">default</option>
                <option value="off">off</option>
                <option value="tokens">tokens</option>
                <option value="full">full</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Send Policy</label>
              <select
                value={sendPolicyValue}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === sendPolicyValue) return;
                  void patchSession({ sendPolicy: next });
                }}
                disabled={patching}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="default">default</option>
                <option value="allow">allow</option>
                <option value="deny">deny</option>
              </select>
            </div>

            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Group Activation</label>
              <select
                value={groupActivationValue}
                onChange={(e) => {
                  const next = e.target.value;
                  if (next === groupActivationValue) return;
                  void patchSession({ groupActivation: next });
                }}
                disabled={patching}
                className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
              >
                <option value="default">default</option>
                <option value="mention">mention</option>
                <option value="always">always</option>
              </select>
            </div>

            <details className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3">
              <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                Exec & Elevation
              </summary>
              <div className="mt-3 grid gap-3">
                <div className="grid gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Elevation</label>
                  <select
                    value={elevatedValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === elevatedValue) return;
                      void patchSession({ elevatedLevel: next });
                    }}
                    disabled={patching}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    <option value="default">default</option>
                    <option value="off">off</option>
                    <option value="on">on</option>
                    <option value="ask">ask</option>
                    <option value="full">full</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Exec Host</label>
                  <select
                    value={execHostValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === execHostValue) return;
                      void patchSession({ execHost: next });
                    }}
                    disabled={patching}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    <option value="default">default</option>
                    <option value="sandbox">sandbox</option>
                    <option value="gateway">gateway</option>
                    <option value="node">node</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Exec Security</label>
                  <select
                    value={execSecurityValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === execSecurityValue) return;
                      void patchSession({ execSecurity: next });
                    }}
                    disabled={patching}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    <option value="default">default</option>
                    <option value="deny">deny</option>
                    <option value="allowlist">allowlist</option>
                    <option value="full">full</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Exec Ask</label>
                  <select
                    value={execAskValue}
                    onChange={(e) => {
                      const next = e.target.value;
                      if (next === execAskValue) return;
                      void patchSession({ execAsk: next });
                    }}
                    disabled={patching}
                    className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  >
                    <option value="default">default</option>
                    <option value="off">off</option>
                    <option value="on-miss">on-miss</option>
                    <option value="always">always</option>
                  </select>
                </div>

                <div className="grid gap-2">
                  <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Exec Node</label>
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={execNodeDraft}
                      onChange={(e) => {
                        setExecNodeDirty(true);
                        setExecNodeDraft(e.target.value);
                      }}
                      placeholder="Optional node id (default clears)"
                      className="min-w-[220px] flex-1"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void (async () => {
                          const next = execNodeDraft.trim();
                          await patchSession({ execNode: next ? next : 'default' });
                          setExecNodeDirty(false);
                        })()
                      }
                      disabled={patching}
                    >
                      Save
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() =>
                        void (async () => {
                          setExecNodeDraft('');
                          await patchSession({ execNode: 'default' });
                          setExecNodeDirty(false);
                        })()
                      }
                      disabled={patching}
                    >
                      Clear
                    </Button>
                  </div>
                  {execNodeValue ? (
                    <div className="text-[11px] text-muted">
                      Current: <span className="font-mono text-[var(--foreground)]">{execNodeValue}</span>
                    </div>
                  ) : (
                    <div className="text-[11px] text-muted">Current: default</div>
                  )}
                </div>

                {sessionInfo?.spawnedBy ? (
                  <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                    <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Spawned By</div>
                    <div className="mt-1 truncate font-mono text-xs text-[var(--foreground)]">{sessionInfo.spawnedBy}</div>
                  </div>
                ) : null}
              </div>
            </details>

            <div className="grid gap-2">
              <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Model Override</label>
              <div className="flex items-center gap-2">
                <Input
                  value={modelDraft}
                  onChange={(e) => setModelDraft(e.target.value)}
                  placeholder='Pick a model key or type "default" to clear'
                  list="mc-model-keys"
                />
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void setModelOverride(modelDraft.trim())}
                  disabled={patching || !modelDraft.trim()}
                >
                  Apply
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => void setModelOverride('default')}
                  disabled={patching}
                >
                  Clear
                </Button>
              </div>
              {modelCatalogLoading ? <div className="text-[11px] text-muted">Loading models…</div> : null}
              {modelCatalogError ? <div className="text-[11px] text-red-600">{modelCatalogError}</div> : null}
              <datalist id="mc-model-keys">
                <option value="default" />
                {(modelCatalog || []).map((m) => (
                  <option key={m.key} value={m.key}>
                    {m.name ? `${m.name} (${m.key})` : m.key}
                  </option>
                ))}
              </datalist>
              <div className="text-xs text-muted">Backed by OpenClaw `session_status` (model=default clears overrides).</div>
            </div>
          </div>
        </details>

        <div className="mt-3 rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
          Pruning and compaction are configured per-agent (OpenClaw defaults). Use OpenClaw Config for policy tuning.
          <div className="mt-2">
            <Link href="/openclaw/config">
              <Button type="button" size="sm" variant="secondary">
                Open OpenClaw Config
              </Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Memory</div>
        <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">Search</div>
        <div className="mt-3 flex items-center gap-2">
          <Input
            value={memoryQuery}
            onChange={(e) => setMemoryQuery(e.target.value)}
            placeholder={agentId ? `Search ${agentId} memory…` : 'Agent memory (agent:* sessions only)'}
          />
          <Button type="button" size="sm" variant="secondary" onClick={() => void searchMemory()} disabled={memoryLoading || !memoryQuery.trim()}>
            {memoryLoading ? 'Searching…' : 'Search'}
          </Button>
        </div>
        {memoryError ? (
          <div className="mt-3 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{memoryError}</div>
        ) : null}

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void loadMemoryStatus()}
            disabled={memoryStatusLoading || !agentId}
          >
            {memoryStatusLoading ? 'Loading…' : 'Index status'}
          </Button>
          <Button type="button" size="sm" variant="secondary" onClick={() => void reindexMemory()} disabled={memoryIndexing || !agentId}>
            {memoryIndexing ? 'Indexing…' : 'Reindex'}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void reindexMemory({ force: true })}
            disabled={memoryIndexing || !agentId}
          >
            Force
          </Button>
        </div>

        {memoryStatus ? (
          <pre className="mt-3 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-[11px] leading-relaxed text-[var(--foreground)]/90">
            {typeof memoryStatus === 'string' ? memoryStatus : JSON.stringify(memoryStatus, null, 2)}
          </pre>
        ) : null}

        <div className="mt-3 space-y-2">
          {memoryResults.length ? (
            memoryResults.map((r, idx) => {
              const score =
                typeof r?.score === 'number'
                  ? String(r.score.toFixed(3))
                  : typeof r?.similarity === 'number'
                    ? String(r.similarity.toFixed(3))
                    : '';
              const path = String(r?.path || r?.file || r?.filename || '');
              const text = String(r?.excerpt || r?.snippet || r?.text || r?.content || '').trim();
              const from =
                typeof r?.from === 'number'
                  ? r.from
                  : typeof r?.start === 'number'
                    ? r.start
                    : typeof r?.startLine === 'number'
                      ? r.startLine
                      : undefined;
              const lines =
                typeof r?.lines === 'number'
                  ? r.lines
                  : typeof r?.lineCount === 'number'
                    ? r.lineCount
                    : typeof r?.endLine === 'number' && typeof from === 'number'
                      ? Math.max(1, r.endLine - from + 1)
                      : undefined;
              const readState = path ? memoryReadMap?.[path] : undefined;
              return (
                <div key={`${path || 'mem'}-${idx}`} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-mono text-[11px] text-[var(--foreground)]/90">{path || 'memory'}</div>
                    <div className="flex items-center gap-2">
                      {score ? <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{score}</Badge> : null}
                      {path ? (
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          className="h-7 px-2 text-[11px]"
                          onClick={() => void readMemory(path, { from, lines })}
                          disabled={Boolean(readState?.loading)}
                          aria-label="Read memory file"
                        >
                          {readState?.loading ? 'Reading…' : 'Read'}
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  {text ? <div className="mt-2 whitespace-pre-wrap text-xs text-muted">{text}</div> : null}
                  {readState?.error ? (
                    <div className="mt-2 rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{readState.error}</div>
                  ) : null}
                  {typeof readState?.text === 'string' && readState.text.trim() ? (
                    <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--card)] p-3 font-mono text-[11px] leading-relaxed text-[var(--foreground)]">
                      {readState.text}
                    </pre>
                  ) : null}
                  {!path && !text ? (
                    <pre className="mt-2 overflow-auto text-[11px] text-muted">{JSON.stringify(r, null, 2)}</pre>
                  ) : null}
                </div>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-3 text-xs text-muted">
              No results yet.
            </div>
          )}
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Sub-agent</div>
        <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">Spawn</div>
        <div className="mt-3 grid gap-3">
          <div className="grid gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Agent</label>
            <select
              value={spawnAgentId}
              onChange={(e) => setSpawnAgentId(e.target.value)}
              className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            >
              <option value="">(default)</option>
              {allAgentIds.map((id) => (
                <option key={id} value={id}>
                  {(() => {
                    const label = agentLabelById.get(id);
                    return label && label !== id ? `${label} (${id})` : id;
                  })()}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Label (optional)</label>
            <Input value={spawnLabel} onChange={(e) => setSpawnLabel(e.target.value)} placeholder="Short label for this run" />
          </div>

          <div className="grid gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Task</label>
            <Textarea
              value={spawnTask}
              onChange={(e) => setSpawnTask(e.target.value)}
              placeholder="What should the sub-agent do?"
              className="min-h-[96px]"
            />
          </div>

          <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <summary className="cursor-pointer text-xs font-semibold uppercase tracking-[0.2em] text-muted">Overrides</summary>
            <div className="mt-3 grid gap-3">
              <div className="grid gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Thinking</label>
                <select
                  value={spawnThinking}
                  onChange={(e) => setSpawnThinking(e.target.value)}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="default">default</option>
                  <option value="off">off</option>
                  <option value="minimal">minimal</option>
                  <option value="low">low</option>
                  <option value="medium">medium</option>
                  <option value="high">high</option>
                  <option value="max">max</option>
                  <option value="xhigh">xhigh</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Model</label>
                <Input
                  value={spawnModel}
                  onChange={(e) => setSpawnModel(e.target.value)}
                  placeholder="Optional model key"
                  list="mc-model-keys"
                />
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Cleanup</label>
                <select
                  value={spawnCleanup}
                  onChange={(e) => setSpawnCleanup(e.target.value === 'delete' ? 'delete' : 'keep')}
                  className="h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                >
                  <option value="keep">keep</option>
                  <option value="delete">delete</option>
                </select>
              </div>

              <div className="grid gap-2">
                <label className="text-[11px] font-semibold uppercase tracking-[0.2em] text-muted">Timeout (seconds)</label>
                <Input
                  type="number"
                  min={0}
                  max={3600}
                  value={String(spawnTimeoutSeconds)}
                  onChange={(e) => {
                    const n = Number.parseInt(e.target.value, 10);
                    setSpawnTimeoutSeconds(Number.isFinite(n) ? Math.max(0, Math.min(3600, n)) : 0);
                  }}
                  placeholder="0 = default"
                />
              </div>
            </div>
          </details>

          <div className="flex items-center gap-2">
            <Button type="button" size="sm" onClick={() => void spawnSubagent()} disabled={spawning || !spawnTask.trim()}>
              {spawning ? 'Spawning…' : 'Spawn'}
            </Button>
            <div className="text-xs text-muted">Announces results back into this chat.</div>
          </div>

          {spawnError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-3 text-xs text-red-700">{spawnError}</div>
          ) : null}

          {spawnResult ? (
            <pre className="max-h-56 overflow-auto whitespace-pre-wrap rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-3 font-mono text-[11px] leading-relaxed text-[var(--foreground)]/90">
              {JSON.stringify(spawnResult, null, 2)}
            </pre>
          ) : null}
        </div>
      </div>

      <div className="rounded-3xl border border-[var(--border)] bg-[var(--card)] p-4 shadow-[var(--shadow)]">
        <div className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">Actions</div>
        <div className="mt-1 text-sm font-semibold text-[var(--foreground)]">Session</div>
        <div className="mt-3 grid gap-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void sendCommand('/model status')}
            disabled={sending || !safeSessionKey.startsWith('agent:')}
          >
            Model status (/model status)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void sendCommand('/compact')}
            disabled={sending || !safeSessionKey.startsWith('agent:')}
          >
            Compact (/compact)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void resetViaGateway()}
            disabled={patching || sending || !safeSessionKey.startsWith('agent:')}
          >
            Reset transcript
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => void hardCompactTranscript()}
            disabled={patching || sending || !safeSessionKey.startsWith('agent:')}
          >
            Trim transcript (hard)
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => void deleteCurrentSession()}
            disabled={patching || isAgentMainSessionKey(safeSessionKey)}
            title={isAgentMainSessionKey(safeSessionKey) ? 'Main sessions cannot be deleted.' : undefined}
          >
            Delete session
          </Button>
        </div>
      </div>
    </div>
  );

  const chatCard = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--card)] shadow-[var(--shadow)]">
      <header className="flex items-center justify-between gap-3 border-b border-[var(--border)] px-4 py-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link
            href="/sessions"
            className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[var(--border)] bg-[var(--surface)] text-muted"
            aria-label="Back to inbox"
          >
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <div className="truncate text-base font-semibold text-[var(--foreground)]">{label.title}</div>
            {label.subtitle ? <div className="truncate text-xs text-muted">{label.subtitle}</div> : null}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => setInspectorOpen(true)}
            size="sm"
            variant="secondary"
            className="h-9 w-9 px-0 sm:w-auto sm:px-3"
            aria-label="Open session details"
          >
            <SlidersHorizontal className="h-4 w-4" />
            <span className="hidden sm:inline">Details</span>
          </Button>
          <Button
            type="button"
            onClick={() => {
              void refreshHistory();
              void refreshSessionInfo();
            }}
            size="sm"
            variant="secondary"
            className="h-9 w-9 px-0 sm:w-auto sm:px-3"
            aria-label="Refresh"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </Button>
        </div>
      </header>

      {linkedTaskId ? (
        <div className="border-b border-[var(--border)] bg-[var(--highlight)]/60 px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--highlight-foreground)]/80">
                Linked task
              </div>
              <div className="mt-1 truncate text-sm font-semibold text-[var(--foreground)]">
                {linkedTask?.title ?? `Task ${linkedTaskId}`}
              </div>
              <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span className="font-mono">{linkedTaskId}</span>
                {linkedTask?.status ? (
                  <Badge className="border-none bg-[var(--card)] text-[var(--foreground)]">{titleCase(linkedTask.status)}</Badge>
                ) : null}
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Link href={`/tasks?task=${encodeURIComponent(linkedTaskId)}`}>
                <Button type="button" size="sm" variant="secondary">
                  Open in board
                </Button>
              </Link>
              <Link href={`/tasks/${encodeURIComponent(linkedTaskId)}`}>
                <Button type="button" size="sm" variant="secondary">
                  Open page
                </Button>
              </Link>
            </div>
          </div>
        </div>
      ) : null}

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
              <div key={(row as any)?.clientId || `${(row as any)?.timestamp || ''}-${idx}`} className={cn('flex', wrapper)}>
                <div className={cn('w-full max-w-[min(720px,92%)] rounded-2xl border px-4 py-3 shadow-sm', bubble)}>
                  {ts ? (
                    <div className={cn('mb-2 text-xs', isUser ? 'text-[var(--chat-user-fg)]/70' : 'text-muted')}>
                      {ts}
                    </div>
                  ) : null}
                  <div
                    className={cn(
                      'text-sm leading-relaxed',
                      isUser ? 'text-[var(--chat-user-fg)]' : 'text-[var(--chat-assistant-fg)]'
                    )}
                  >
                    <div
                      className={cn(
                        'prose max-w-none',
                        isUser ? 'text-[var(--chat-user-fg)]' : 'text-[var(--chat-assistant-fg)]'
                      )}
                    >
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
        <div className="flex items-end gap-2">
          <Textarea
            ref={composerRef}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter') return;
              if (e.shiftKey) return; // newline
              e.preventDefault();
              void sendMessage();
            }}
            placeholder="Write a message…"
            className="min-h-[72px] flex-1 resize-none"
          />
          <button
            type="button"
            onClick={() => void sendMessage()}
            disabled={sending || !message.trim() || !safeSessionKey}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[var(--accent-foreground)] shadow-sm transition hover:bg-[var(--accent-strong)] disabled:opacity-50"
            aria-label="Send message"
          >
            {sending ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </div>
        <div className="mt-2 flex items-center justify-between px-1 text-[11px] text-muted">
          <div>Enter to send. Shift+Enter for a newline.</div>
          {sending ? <div className="tabular-nums">Sending…</div> : null}
        </div>
      </div>
    </div>
  );

  return (
    <>
      {chatCard}

      {inspectorRendered ? (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            aria-label="Close session details"
            className={cn(
              'absolute inset-0 bg-black/30 backdrop-blur-sm transition-opacity duration-200',
              inspectorVisible ? 'opacity-100' : 'pointer-events-none opacity-0'
            )}
            onClick={() => setInspectorOpen(false)}
          />
          <div
            className={cn(
              'absolute right-0 top-0 flex h-full w-full max-w-md flex-col bg-[var(--surface)] shadow-2xl transition-transform duration-200 ease-out will-change-transform sm:max-w-lg',
              inspectorVisible ? 'translate-x-0' : 'translate-x-full'
            )}
          >
            <div className="flex items-center justify-between border-b border-[var(--border)] px-6 py-4">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Session</div>
                <div className="truncate text-lg font-semibold">{label.title}</div>
                <div className="mt-1 truncate font-mono text-[11px] text-muted">{safeSessionKey}</div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setInspectorOpen(false)}>
                Close
              </Button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto p-4 mc-scroll">{inspectorPanels}</div>
          </div>
        </div>
      ) : null}
    </>
  );
}
