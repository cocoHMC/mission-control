'use client';

import * as React from 'react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';

type StatusReport = any;
type UsageCost = any;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function fmtTime(ms?: number) {
  if (!ms) return '';
  try {
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? '' : d.toLocaleString();
  } catch {
    return '';
  }
}

export function StatusClient() {
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [report, setReport] = React.useState<StatusReport | null>(null);
  const [usage, setUsage] = React.useState<UsageCost | null>(null);

  const [days, setDays] = React.useState(14);
  const [deep, setDeep] = React.useState(false);
  const [includeUsageProbe, setIncludeUsageProbe] = React.useState(false);
  const [all, setAll] = React.useState(false);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const q = new URLSearchParams({
        deep: deep ? '1' : '0',
        usage: includeUsageProbe ? '1' : '0',
        all: all ? '1' : '0',
      });
      const [statusRes, usageRes] = await Promise.all([
        fetch(`/api/openclaw/status/report?${q.toString()}`, { cache: 'no-store' }),
        fetch(`/api/openclaw/gateway/usage-cost?days=${days}`, { cache: 'no-store' }),
      ]);

      const statusJson = await statusRes.json().catch(() => null);
      if (!statusRes.ok) throw new Error(statusJson?.error || 'Failed to load OpenClaw status');
      setReport(statusJson?.report ?? null);

      const usageJson = await usageRes.json().catch(() => null);
      if (!usageRes.ok) throw new Error(usageJson?.error || 'Failed to load usage-cost summary');
      setUsage(usageJson?.usage ?? null);
    } catch (err: any) {
      setError(err?.message || String(err));
      setReport(null);
      setUsage(null);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sessions = Array.isArray(report?.sessions?.recent) ? report.sessions.recent : [];
  const channelSummary = Array.isArray(report?.channelSummary) ? report.channelSummary : [];
  const heartbeatAgents = Array.isArray(report?.heartbeat?.agents) ? report.heartbeat.agents : [];
  const queuedEvents = Array.isArray(report?.queuedSystemEvents) ? report.queuedSystemEvents : [];

  const totals = usage?.totals || null;
  const daily = Array.isArray(usage?.daily) ? usage.daily : [];
  const lastDay = daily.length ? daily[daily.length - 1] : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Sessions: {report?.sessions?.count ?? '—'}</Badge>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Queued events: {queuedEvents.length}</Badge>
          <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">Heartbeats: {heartbeatAgents.length}</Badge>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={deep} onChange={(e) => setDeep(e.target.checked)} />
            Deep probes
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={includeUsageProbe}
              onChange={(e) => setIncludeUsageProbe(e.target.checked)}
            />
            Provider usage snapshot
          </label>
          <label className="flex items-center gap-2 text-xs text-muted">
            <input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} />
            Full report
          </label>
          <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
            {loading ? 'Refreshing…' : 'Refresh'}
          </Button>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Channel Health</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            {channelSummary.length ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                {channelSummary.map((line: string, idx: number) => (
                  <div key={idx} className="whitespace-pre-wrap font-mono text-[var(--foreground)]/90">
                    {line}
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-sm text-muted">No channel summary returned.</div>
            )}
            <Link href="/openclaw/channels">
              <Button size="sm" variant="secondary">
                Open Channels
              </Button>
            </Link>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Costs</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Window</div>
              <select
                className="h-9 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-xs text-[var(--foreground)]"
                value={days}
                onChange={(e) => setDays(Number.parseInt(e.target.value, 10))}
              >
                {[7, 14, 30, 90].map((d) => (
                  <option key={d} value={d}>
                    {d} days
                  </option>
                ))}
              </select>
            </div>

            {totals ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Totals</div>
                <div className="mt-2 grid gap-1">
                  <div>Input: <span className="font-mono text-[var(--foreground)]">{totals.input ?? '—'}</span></div>
                  <div>Output: <span className="font-mono text-[var(--foreground)]">{totals.output ?? '—'}</span></div>
                  <div>Cache read: <span className="font-mono text-[var(--foreground)]">{totals.cacheRead ?? '—'}</span></div>
                  <div>Total tokens: <span className="font-mono text-[var(--foreground)]">{totals.totalTokens ?? '—'}</span></div>
                  <div>Total cost: <span className="font-mono text-[var(--foreground)]">{totals.totalCost ?? '—'}</span></div>
                </div>
              </div>
            ) : (
              <div className="text-xs text-muted">No totals returned.</div>
            )}

            {lastDay ? (
              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Latest day</div>
                <div className="mt-2 grid gap-1">
                  <div>Date: <span className="font-mono text-[var(--foreground)]">{lastDay.date || '—'}</span></div>
                  <div>Tokens: <span className="font-mono text-[var(--foreground)]">{lastDay.totalTokens ?? '—'}</span></div>
                  <div>Cost: <span className="font-mono text-[var(--foreground)]">{lastDay.totalCost ?? '—'}</span></div>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Recent Sessions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {!sessions.length ? <div className="text-sm text-muted">No sessions returned.</div> : null}
            {sessions.slice(0, 30).map((s: any) => {
              const key = String(s.key || '');
              const updatedAt = isFiniteNumber(s.updatedAt) ? fmtTime(s.updatedAt) : '';
              const pct = isFiniteNumber(s.percentUsed) ? `${s.percentUsed}%` : '';
              const model = String(s.model || '');
              const totalTokens = isFiniteNumber(s.totalTokens) ? s.totalTokens : null;
              const input = isFiniteNumber(s.inputTokens) ? s.inputTokens : null;
              const output = isFiniteNumber(s.outputTokens) ? s.outputTokens : null;
              return (
                <div key={key} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0 truncate font-mono text-xs text-[var(--foreground)]/90">{key || 'session'}</div>
                    <div className="flex flex-wrap items-center gap-2">
                      {pct ? <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{pct}</Badge> : null}
                      {model ? <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">{model}</Badge> : null}
                      <Link href={`/sessions?sessionKey=${encodeURIComponent(key)}`}>
                        <Button size="sm" variant="secondary">
                          Open
                        </Button>
                      </Link>
                    </div>
                  </div>

                  <div className="mt-2 grid gap-2 text-xs text-muted sm:grid-cols-3">
                    <div>Updated: <span className="font-mono text-[var(--foreground)]">{updatedAt || '—'}</span></div>
                    <div>Total: <span className="font-mono text-[var(--foreground)]">{totalTokens ?? '—'}</span></div>
                    <div>
                      In/Out:{' '}
                      <span className="font-mono text-[var(--foreground)]">
                        {input ?? '—'} / {output ?? '—'}
                      </span>
                    </div>
                  </div>

                  <div className="mt-2 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
                    <span className="min-w-0 truncate font-mono text-[11px] text-[var(--foreground)]/80">{key}</span>
                    <CopyButton value={key} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>

        <Card className="lg:col-span-3">
          <CardHeader>
            <CardTitle>Heartbeat Config</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-muted">
            {!heartbeatAgents.length ? (
              <div className="text-sm text-muted">No heartbeat config returned.</div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {heartbeatAgents.slice(0, 8).map((a: any) => (
                  <div key={a.agentId} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-mono text-xs text-[var(--foreground)]">{a.agentId}</div>
                      <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
                        {a.enabled ? 'enabled' : 'disabled'}
                      </Badge>
                    </div>
                    <div className="mt-2 text-xs text-muted">
                      Every: <span className="font-mono text-[var(--foreground)]">{a.every || '—'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link href="/openclaw/system">
              <Button size="sm" variant="secondary">
                Open System
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

