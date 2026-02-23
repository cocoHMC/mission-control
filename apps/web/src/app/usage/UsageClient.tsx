'use client';

import * as React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { mcFetch } from '@/lib/clientApi';
import type { Project, UsageEvent } from '@/lib/types';
import { formatShortDate } from '@/lib/utils';

type UsageSummaryRow = {
  id: string;
  events: number;
  inputTokens: number;
  outputTokens: number;
  tokensUsed: number;
  estimatedCostUsd: number;
};

type UsageSummary = {
  ok?: boolean;
  range?: string;
  from?: string;
  to?: string;
  totals?: {
    events?: number;
    inputTokens?: number;
    outputTokens?: number;
    tokensUsed?: number;
    estimatedCostUsd?: number;
  };
  topModels?: UsageSummaryRow[];
  topProjects?: UsageSummaryRow[];
  topTasks?: UsageSummaryRow[];
  topAgents?: UsageSummaryRow[];
};

function money(value: number) {
  return `$${Number(value || 0).toFixed(4)}`;
}

function num(value: number) {
  return new Intl.NumberFormat('en-US').format(Number(value || 0));
}

export function UsageClient({
  initialProjects,
  initialEvents,
  initialProjectId,
}: {
  initialProjects: Project[];
  initialEvents: UsageEvent[];
  initialProjectId?: string;
}) {
  const [range, setRange] = React.useState<'today' | 'week' | 'month'>('today');
  const [projectId, setProjectId] = React.useState(String(initialProjectId || '').trim());
  const [summary, setSummary] = React.useState<UsageSummary | null>(null);
  const [events, setEvents] = React.useState<UsageEvent[]>(initialEvents || []);
  const [loading, setLoading] = React.useState(false);

  const projectNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const project of initialProjects || []) {
      const id = String(project.id || '').trim();
      if (!id) continue;
      map.set(id, String(project.name || id));
    }
    return map;
  }, [initialProjects]);

  const budgetProjects = React.useMemo(
    () =>
      (initialProjects || []).filter(
        (p) => (Number(p.dailyBudgetUsd || 0) > 0 || Number(p.monthlyBudgetUsd || 0) > 0) && !p.archived
      ),
    [initialProjects]
  );

  const topProjectSpend = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const row of summary?.topProjects || []) {
      map.set(String(row.id || '').trim(), Number(row.estimatedCostUsd || 0));
    }
    return map;
  }, [summary]);

  async function refresh() {
    setLoading(true);
    try {
      const q = new URLSearchParams({ range });
      if (projectId) q.set('projectId', projectId);
      const [sRes, eRes] = await Promise.all([
        mcFetch(`/api/usage/summary?${q.toString()}`, { cache: 'no-store' }),
        mcFetch(
          `/api/usage/events?${new URLSearchParams({
            page: '1',
            perPage: '120',
            ...(projectId ? { projectId } : {}),
          }).toString()}`,
          { cache: 'no-store' }
        ),
      ]);
      const sJson = await sRes.json().catch(() => null);
      const eJson = await eRes.json().catch(() => null);
      if (sRes.ok) setSummary(sJson as UsageSummary);
      if (eRes.ok) setEvents(Array.isArray(eJson?.items) ? (eJson.items as UsageEvent[]) : []);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, projectId]);

  return (
    <div className="flex h-full min-h-0 flex-col gap-4">
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Range</div>
            <div className="flex items-center gap-1 rounded-full border border-[var(--border)] bg-[var(--surface)] p-1">
              {(['today', 'week', 'month'] as const).map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setRange(r)}
                  className={`rounded-full px-3 py-1 text-xs font-medium ${range === r ? 'bg-[var(--accent)] text-[var(--accent-foreground)]' : 'text-muted'}`}
                >
                  {r}
                </button>
              ))}
            </div>
            <select
              className="h-9 rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-xs"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">All projects</option>
              {initialProjects
                .filter((p) => !p.archived)
                .map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name || project.id}
                  </option>
                ))}
            </select>
          </div>
          <Button type="button" size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Estimated cost</div>
            <div className="mt-1 text-lg font-semibold">{money(Number(summary?.totals?.estimatedCostUsd || 0))}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Events</div>
            <div className="mt-1 text-lg font-semibold">{num(Number(summary?.totals?.events || 0))}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Input tokens</div>
            <div className="mt-1 text-lg font-semibold">{num(Number(summary?.totals?.inputTokens || 0))}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Output tokens</div>
            <div className="mt-1 text-lg font-semibold">{num(Number(summary?.totals?.outputTokens || 0))}</div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Total tokens</div>
            <div className="mt-1 text-lg font-semibold">{num(Number(summary?.totals?.tokensUsed || 0))}</div>
          </div>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-3">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-sm font-semibold">Top models</div>
          <div className="mt-3 space-y-2">
            {(summary?.topModels || []).map((row) => (
              <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-mono text-[var(--foreground)]">{row.id}</div>
                  <Badge className="border-none bg-[var(--card)] text-[var(--foreground)]">{money(row.estimatedCostUsd)}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted">{num(row.tokensUsed)} tokens · {num(row.events)} events</div>
              </div>
            ))}
            {!summary?.topModels?.length ? <div className="text-sm text-muted">No model usage yet.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-sm font-semibold">Top agents</div>
          <div className="mt-3 space-y-2">
            {(summary?.topAgents || []).map((row) => (
              <div key={row.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="truncate text-xs font-mono text-[var(--foreground)]">@{row.id}</div>
                  <Badge className="border-none bg-[var(--card)] text-[var(--foreground)]">{money(row.estimatedCostUsd)}</Badge>
                </div>
                <div className="mt-1 text-xs text-muted">{num(row.tokensUsed)} tokens · {num(row.events)} events</div>
              </div>
            ))}
            {!summary?.topAgents?.length ? <div className="text-sm text-muted">No agent usage yet.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
          <div className="text-sm font-semibold">Project budgets</div>
          <div className="mt-3 space-y-2">
            {budgetProjects.map((project) => {
              const spend = Number(topProjectSpend.get(project.id) || 0);
              const daily = Number(project.dailyBudgetUsd || 0);
              const monthly = Number(project.monthlyBudgetUsd || 0);
              const warn = Number(project.budgetWarnPct || 90);
              const activeBudget = range === 'month' ? monthly : daily || monthly;
              const pct = activeBudget > 0 ? Math.round((spend / activeBudget) * 100) : 0;
              const warnHit = activeBudget > 0 && pct >= warn;
              const hardHit = activeBudget > 0 && pct >= 100;
              return (
                <div key={project.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                  <div className="flex items-center justify-between gap-2">
                    <div className="truncate text-xs font-medium">{project.name || project.id}</div>
                    <Badge className={`border-none ${hardHit ? 'bg-red-600 text-white' : warnHit ? 'bg-amber-500 text-black' : 'bg-[var(--card)] text-[var(--foreground)]'}`}>
                      {pct || 0}%
                    </Badge>
                  </div>
                  <div className="mt-1 text-xs text-muted">
                    spend {money(spend)} · budget {money(activeBudget)} · warn {warn}%
                  </div>
                </div>
              );
            })}
            {!budgetProjects.length ? <div className="text-sm text-muted">No budgets configured yet.</div> : null}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-4">
        <div className="text-sm font-semibold">Recent usage events</div>
        <div className="mt-3 max-h-[360px] overflow-auto mc-scroll">
          <div className="space-y-2 pr-1">
            {events.map((event) => (
              <div key={event.id} className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted">
                  <div className="flex flex-wrap items-center gap-2">
                    <span>{event.ts ? formatShortDate(event.ts) : '—'}</span>
                    {event.projectId ? <span>project {projectNameById.get(event.projectId) || event.projectId}</span> : null}
                    {event.taskId ? <span className="font-mono">task {event.taskId}</span> : null}
                    {event.agentId ? <span className="font-mono">@{event.agentId}</span> : null}
                  </div>
                  <Badge className="border-none bg-[var(--card)] text-[var(--foreground)]">
                    {money(Number(event.estimatedCostUsd || 0))}
                  </Badge>
                </div>
                <div className="mt-1 text-xs text-muted">
                  {event.model ? <span className="font-mono text-[var(--foreground)]">{event.model}</span> : 'unknown model'} · in {num(Number(event.inputTokens || 0))} · out {num(Number(event.outputTokens || 0))} · total {num(Number(event.tokensUsed || 0))}
                </div>
              </div>
            ))}
            {!events.length ? <div className="text-sm text-muted">No usage events yet.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
