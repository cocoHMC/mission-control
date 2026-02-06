'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';

type CronStatus = {
  enabled?: boolean;
  storePath?: string;
  jobs?: number;
  nextWakeAtMs?: number;
};

type CronJob = {
  id: string;
  agentId?: string;
  name?: string;
  enabled?: boolean;
  schedule?: { kind?: string; expr?: string; tz?: string };
  createdAtMs?: number;
  updatedAtMs?: number;
  sessionTarget?: string;
  wakeMode?: string;
  payload?: any;
  state?: { nextRunAtMs?: number; lastRunAtMs?: number; lastStatus?: string; lastDurationMs?: number };
};

type CronList = { jobs?: CronJob[] };

function fmt(ms?: number) {
  if (!ms) return '—';
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return '—';
  }
}

function short(text: string, n = 140) {
  const s = (text || '').trim();
  if (s.length <= n) return s;
  return `${s.slice(0, n)}…`;
}

export function CronClient() {
  const [loading, setLoading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [success, setSuccess] = React.useState<string | null>(null);

  const [status, setStatus] = React.useState<CronStatus | null>(null);
  const [list, setList] = React.useState<CronList>({});
  const [selectedJobId, setSelectedJobId] = React.useState<string>('');
  const [runs, setRuns] = React.useState<any | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const [statusRes, listRes] = await Promise.all([
        mcFetch('/api/openclaw/cron/status', { cache: 'no-store' }),
        mcFetch('/api/openclaw/cron/list?all=1', { cache: 'no-store' }),
      ]);
      const statusJson = await statusRes.json().catch(() => null);
      if (!statusRes.ok) throw new Error(statusJson?.error || 'Failed to load cron status');
      setStatus((statusJson?.status as CronStatus) || null);

      const listJson = await listRes.json().catch(() => null);
      if (!listRes.ok) throw new Error(listJson?.error || 'Failed to list cron jobs');
      setList(listJson || {});
    } catch (err: any) {
      setError(err?.message || String(err));
      setStatus(null);
      setList({});
    } finally {
      setLoading(false);
    }
  }

  async function loadRuns(jobId: string) {
    const id = jobId.trim();
    if (!id) return;
    setRuns(null);
    try {
      const q = new URLSearchParams({ id, limit: '50' });
      const res = await mcFetch(`/api/openclaw/cron/runs?${q.toString()}`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Failed to load run history');
      setRuns(json?.runs || null);
    } catch (err: any) {
      setError(err?.message || String(err));
    }
  }

  React.useEffect(() => {
    void refresh();
  }, []);

  React.useEffect(() => {
    if (!selectedJobId) return;
    void loadRuns(selectedJobId);
  }, [selectedJobId]);

  async function action(action: 'enable' | 'disable' | 'remove', id: string) {
    if (!id) return;
    if (action === 'remove' && !window.confirm('Remove this cron job?')) return;
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await mcFetch('/api/openclaw/cron/action', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action, id }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || 'Action failed');
      setSuccess(`${action} ok.`);
      if (action === 'remove' && selectedJobId === id) setSelectedJobId('');
      await refresh();
    } catch (err: any) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  }

  const jobs = Array.isArray(list.jobs) ? list.jobs.slice() : [];
  jobs.sort((a, b) => {
    const ta = a.state?.nextRunAtMs || 0;
    const tb = b.state?.nextRunAtMs || 0;
    return ta - tb;
  });

  const selected = selectedJobId ? jobs.find((j) => j.id === selectedJobId) || null : null;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr,420px]">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between gap-3">
            <span>Cron Jobs</span>
            <Button size="sm" variant="secondary" onClick={() => void refresh()} disabled={loading}>
              {loading ? 'Refreshing…' : 'Refresh'}
            </Button>
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>
          ) : null}
          {success ? (
            <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-700">{success}</div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              enabled: {status?.enabled ? 'yes' : 'no'}
            </Badge>
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              jobs: {typeof status?.jobs === 'number' ? status.jobs : jobs.length}
            </Badge>
            <Badge className="border-none bg-[var(--surface)] text-[var(--foreground)]">
              next wake: {fmt(status?.nextWakeAtMs)}
            </Badge>
          </div>

          <div className="space-y-2">
            {jobs.map((j) => {
              const active = j.id === selectedJobId;
              const msg = typeof j?.payload?.message === 'string' ? j.payload.message : '';
              const dest = typeof j?.payload?.toMasked === 'string' ? j.payload.toMasked : '';
              return (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setSelectedJobId(j.id)}
                  className={[
                    'w-full rounded-2xl border p-4 text-left transition',
                    active ? 'border-[var(--accent)] bg-[var(--accent)]/10' : 'border-[var(--border)] bg-[var(--card)] hover:bg-[color:var(--foreground)]/5',
                  ].join(' ')}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-[var(--foreground)]">{j.name || j.id}</div>
                      <div className="mt-1 text-xs text-muted">
                        agent <span className="font-mono">{j.agentId || 'default'}</span> · {j.enabled ? 'enabled' : 'disabled'}
                      </div>
                    </div>
                    <Badge className="border-none bg-[var(--highlight)] text-[var(--foreground)]">{j.state?.lastStatus || '—'}</Badge>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-2 text-xs text-muted">
                    {j.schedule?.expr ? <span className="font-mono">{j.schedule.expr}</span> : null}
                    {j.schedule?.tz ? <span>{j.schedule.tz}</span> : null}
                    {dest ? <span>to {dest}</span> : null}
                    {j.state?.nextRunAtMs ? <span>next {fmt(j.state.nextRunAtMs)}</span> : null}
                  </div>
                  {msg ? <div className="mt-2 text-xs text-muted">{short(msg)}</div> : null}
                </button>
              );
            })}
            {!jobs.length ? (
              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-sm text-muted">
                No cron jobs found.
              </div>
            ) : null}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Job Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-muted">
          {!selected ? (
            <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4">Select a job.</div>
          ) : null}

          {selected ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-[var(--foreground)]">{selected.name || selected.id}</div>
                  <div className="mt-1 font-mono text-xs text-muted">{selected.id}</div>
                </div>
                <CopyButton value={selected.id} />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="secondary" onClick={() => void action('enable', selected.id)} disabled={busy || selected.enabled}>
                  Enable
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void action('disable', selected.id)} disabled={busy || !selected.enabled}>
                  Disable
                </Button>
                <Button size="sm" variant="secondary" onClick={() => void action('remove', selected.id)} disabled={busy}>
                  Remove
                </Button>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Schedule</div>
                <div className="mt-2">
                  <span className="font-mono">{selected.schedule?.expr || '—'}</span> {selected.schedule?.tz ? `(${selected.schedule.tz})` : ''}
                </div>
                <div className="mt-2 text-muted">Next: {fmt(selected.state?.nextRunAtMs)}</div>
                <div className="mt-1 text-muted">Last: {fmt(selected.state?.lastRunAtMs)}</div>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Payload</div>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-muted">
                  {JSON.stringify(selected.payload || {}, null, 2)}
                </pre>
              </div>

              <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 text-xs">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Recent runs</div>
                <pre className="mt-2 max-h-56 overflow-auto whitespace-pre-wrap text-xs text-muted">
                  {runs ? JSON.stringify(runs, null, 2) : 'Loading...'}
                </pre>
              </div>

              <div className="rounded-2xl border border-dashed border-[var(--border)] bg-[var(--surface)] p-4 text-xs text-muted">
                Cron jobs can wake agents and spend tokens. Use them for real automation, not polling.
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
