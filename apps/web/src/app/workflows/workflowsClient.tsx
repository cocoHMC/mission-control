'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { mcFetch } from '@/lib/clientApi';
import type { Workflow, WorkflowRun, WorkflowSchedule, WorkflowTrigger } from '@/lib/types';
import { cn, formatShortDate } from '@/lib/utils';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function pretty(value: unknown) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

export function WorkflowsClient({
  initialWorkflows,
  initialRuns,
  initialSchedules,
  initialTriggers,
}: {
  initialWorkflows: Workflow[];
  initialRuns: WorkflowRun[];
  initialSchedules: WorkflowSchedule[];
  initialTriggers: WorkflowTrigger[];
}) {
  const params = useSearchParams();
  const [workflows, setWorkflows] = React.useState<Workflow[]>(initialWorkflows);
  const [runs, setRuns] = React.useState<WorkflowRun[]>(initialRuns);
  const [schedules, setSchedules] = React.useState<WorkflowSchedule[]>(initialSchedules);
  const [triggers, setTriggers] = React.useState<WorkflowTrigger[]>(initialTriggers);

  const [creating, setCreating] = React.useState(false);
  const [name, setName] = React.useState('');
  const [kind, setKind] = React.useState<'manual' | 'lobster'>('lobster');
  const [description, setDescription] = React.useState('');
  const [pipeline, setPipeline] = React.useState('');

  const [runWorkflowId, setRunWorkflowId] = React.useState<string>(initialWorkflows[0]?.id || '');
  const [taskId, setTaskId] = React.useState('');
  const [sessionKey, setSessionKey] = React.useState('');
  const [varsText, setVarsText] = React.useState('{}');
  const [running, setRunning] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [scheduleWorkflowId, setScheduleWorkflowId] = React.useState<string>(initialWorkflows[0]?.id || '');
  const [scheduleInterval, setScheduleInterval] = React.useState('60');
  const [scheduleEnabled, setScheduleEnabled] = React.useState(true);
  const [scheduleTaskId, setScheduleTaskId] = React.useState('');
  const [scheduleSessionKey, setScheduleSessionKey] = React.useState('');
  const [scheduleVarsText, setScheduleVarsText] = React.useState('{}');
  const [scheduling, setScheduling] = React.useState(false);

  const [triggerWorkflowId, setTriggerWorkflowId] = React.useState<string>(initialWorkflows[0]?.id || '');
  const [triggerEnabled, setTriggerEnabled] = React.useState(true);
  const [triggerStatusTo, setTriggerStatusTo] = React.useState<'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked'>('review');
  const [triggerLabelsAny, setTriggerLabelsAny] = React.useState('');
  const [triggerSessionKey, setTriggerSessionKey] = React.useState('');
  const [triggerVarsText, setTriggerVarsText] = React.useState('{}');
  const [creatingTrigger, setCreatingTrigger] = React.useState(false);

  React.useEffect(() => {
    // Support deep links like /workflows?taskId=...&sessionKey=...&workflowId=...
    const qTaskId = String(params?.get('taskId') || '').trim();
    const qSessionKey = String(params?.get('sessionKey') || '').trim();
    const qWorkflowId = String(params?.get('workflowId') || '').trim();

    if (qTaskId) setTaskId(qTaskId);
    if (qSessionKey) setSessionKey(qSessionKey);
    if (qWorkflowId) setRunWorkflowId(qWorkflowId);
  }, [params]);

  async function refresh() {
    const [wf, rr] = await Promise.all([
      mcFetch(`/api/workflows?${new URLSearchParams({ page: '1', perPage: '200', sort: 'name' }).toString()}`, {
        cache: 'no-store',
      })
        .then((r) => r.json())
        .catch(() => null),
      mcFetch(`/api/workflow-runs?${new URLSearchParams({ page: '1', perPage: '50', sort: '-createdAt' }).toString()}`, {
        cache: 'no-store',
      })
        .then((r) => r.json())
        .catch(() => null),
    ]);
    const ss = await mcFetch(
      `/api/workflow-schedules?${new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' }).toString()}`,
      { cache: 'no-store' }
    )
      .then((r) => r.json())
      .catch(() => null);
    const tt = await mcFetch(
      `/api/workflow-triggers?${new URLSearchParams({ page: '1', perPage: '200', sort: '-updatedAt' }).toString()}`,
      { cache: 'no-store' }
    )
      .then((r) => r.json())
      .catch(() => null);
    setWorkflows(Array.isArray(wf?.items) ? wf.items : []);
    setRuns(Array.isArray(rr?.items) ? rr.items : []);
    setSchedules(Array.isArray(ss?.items) ? ss.items : []);
    setTriggers(Array.isArray(tt?.items) ? tt.items : []);
  }

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    setCreating(true);
    setError(null);
    try {
      const res = await mcFetch('/api/workflows', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          name: n,
          kind,
          description: description.trim(),
          pipeline: pipeline.trim(),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Create failed ${res.status}`);
      setName('');
      setDescription('');
      setPipeline('');
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  }

  async function onRun(e: React.FormEvent) {
    e.preventDefault();
    const wfId = safeString(runWorkflowId);
    if (!wfId) return;
    setRunning(true);
    setError(null);
    try {
      let vars: any = null;
      const raw = varsText.trim();
      if (raw) {
        try {
          vars = JSON.parse(raw);
        } catch {
          throw new Error('Vars must be valid JSON.');
        }
      }
      const res = await mcFetch('/api/workflow-runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowId: wfId,
          taskId: taskId.trim(),
          sessionKey: sessionKey.trim(),
          vars,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Run failed ${res.status}`);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function onCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    const wfId = safeString(scheduleWorkflowId);
    if (!wfId) return;
    const intervalMinutes = Number.parseFloat(scheduleInterval);
    if (!Number.isFinite(intervalMinutes) || intervalMinutes <= 0) {
      setError('Interval must be a positive number of minutes.');
      return;
    }

    setScheduling(true);
    setError(null);
    try {
      let vars: any = null;
      const raw = scheduleVarsText.trim();
      if (raw) {
        try {
          vars = JSON.parse(raw);
        } catch {
          throw new Error('Schedule vars must be valid JSON.');
        }
      }

      const res = await mcFetch('/api/workflow-schedules', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowId: wfId,
          enabled: scheduleEnabled,
          intervalMinutes,
          taskId: scheduleTaskId.trim(),
          sessionKey: scheduleSessionKey.trim(),
          vars,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Create schedule failed ${res.status}`);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setScheduling(false);
    }
  }

  async function toggleSchedule(id: string, enabled: boolean) {
    setError(null);
    const res = await mcFetch(`/api/workflow-schedules/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error || `Update schedule failed (${res.status})`);
      return;
    }
    await refresh();
  }

  async function deleteSchedule(id: string) {
    if (!window.confirm('Delete schedule?')) return;
    setError(null);
    const res = await mcFetch(`/api/workflow-schedules/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error || `Delete schedule failed (${res.status})`);
      return;
    }
    await refresh();
  }

  async function runScheduleNow(s: WorkflowSchedule) {
    setError(null);
    setRunning(true);
    try {
      const res = await mcFetch('/api/workflow-runs', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowId: s.workflowId,
          taskId: safeString(s.taskId),
          sessionKey: safeString(s.sessionKey),
          vars: s.vars ?? null,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Run failed ${res.status}`);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function onCreateTrigger(e: React.FormEvent) {
    e.preventDefault();
    const wfId = safeString(triggerWorkflowId);
    if (!wfId) return;
    setCreatingTrigger(true);
    setError(null);
    try {
      let vars: any = null;
      const raw = triggerVarsText.trim();
      if (raw) {
        try {
          vars = JSON.parse(raw);
        } catch {
          throw new Error('Trigger vars must be valid JSON.');
        }
      }
      const labelsAny = triggerLabelsAny
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const res = await mcFetch('/api/workflow-triggers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowId: wfId,
          enabled: triggerEnabled,
          event: 'task_status_to',
          statusTo: triggerStatusTo,
          labelsAny,
          sessionKey: triggerSessionKey.trim(),
          vars,
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Create trigger failed ${res.status}`);
      await refresh();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreatingTrigger(false);
    }
  }

  async function toggleTrigger(id: string, enabled: boolean) {
    setError(null);
    const res = await mcFetch(`/api/workflow-triggers/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ enabled }),
    });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error || `Update trigger failed (${res.status})`);
      return;
    }
    await refresh();
  }

  async function deleteTrigger(id: string) {
    if (!window.confirm('Delete trigger?')) return;
    setError(null);
    const res = await mcFetch(`/api/workflow-triggers/${encodeURIComponent(id)}`, { method: 'DELETE' });
    if (!res.ok) {
      const json = await res.json().catch(() => null);
      setError(json?.error || `Delete trigger failed (${res.status})`);
      return;
    }
    await refresh();
  }

  return (
    <div className="grid min-h-0 gap-6 lg:grid-cols-2">
      <div className="min-h-0 space-y-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Create Workflow</div>
          <div className="mt-2 text-xs text-muted">Store a reusable runbook. Lobster workflows execute via the OpenClaw gateway tool.</div>
          {error ? <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div> : null}
          <form onSubmit={onCreate} className="mt-4 space-y-3">
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Workflow name" />
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Kind</span>
              <select
                className="rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)]"
                value={kind}
                onChange={(e) => setKind(e.target.value as any)}
              >
                <option value="lobster">lobster</option>
                <option value="manual">manual</option>
              </select>
            </div>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Description" />
            <Textarea
              value={pipeline}
              onChange={(e) => setPipeline(e.target.value)}
              placeholder={kind === 'lobster' ? 'Lobster pipeline (YAML/JSON)' : 'Optional notes'}
              className="min-h-[140px] font-mono text-xs"
            />
            <Button type="submit" disabled={creating}>
              {creating ? 'Creating…' : 'Create'}
            </Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Run Workflow</div>
          <div className="mt-2 text-xs text-muted">Optionally bind a run to a task and/or an agent session key.</div>
          <form onSubmit={onRun} className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Workflow</span>
              <select
                className="min-w-[260px] rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)]"
                value={runWorkflowId}
                onChange={(e) => setRunWorkflowId(e.target.value)}
              >
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.kind || 'manual'})
                  </option>
                ))}
              </select>
            </div>
            <Input value={taskId} onChange={(e) => setTaskId(e.target.value)} placeholder="Task id (optional)" />
            <Input value={sessionKey} onChange={(e) => setSessionKey(e.target.value)} placeholder="Session key (optional, agent:...)" />
            <Textarea value={varsText} onChange={(e) => setVarsText(e.target.value)} className="min-h-[120px] font-mono text-xs" />
            <div className="flex items-center gap-2">
              <Button type="submit" disabled={running}>
                {running ? 'Running…' : 'Run'}
              </Button>
              <Button type="button" variant="secondary" onClick={() => void refresh()}>
                Refresh
              </Button>
            </div>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Schedule Workflow</div>
          <div className="mt-2 text-xs text-muted">Run a workflow repeatedly via the worker (interval-based).</div>
          <form onSubmit={onCreateSchedule} className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Workflow</span>
              <select
                className="min-w-[260px] rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)]"
                value={scheduleWorkflowId}
                onChange={(e) => setScheduleWorkflowId(e.target.value)}
              >
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.kind || 'manual'})
                  </option>
                ))}
              </select>
            </div>
            <Input value={scheduleInterval} onChange={(e) => setScheduleInterval(e.target.value)} placeholder="Interval minutes (e.g. 60)" />
            <Input value={scheduleTaskId} onChange={(e) => setScheduleTaskId(e.target.value)} placeholder="Task id (optional)" />
            <Input
              value={scheduleSessionKey}
              onChange={(e) => setScheduleSessionKey(e.target.value)}
              placeholder="Session key (optional)"
            />
            <Textarea value={scheduleVarsText} onChange={(e) => setScheduleVarsText(e.target.value)} className="min-h-[120px] font-mono text-xs" />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={scheduleEnabled} onChange={(e) => setScheduleEnabled(e.target.checked)} />
              Enabled
            </label>
            <Button type="submit" disabled={scheduling}>
              {scheduling ? 'Scheduling…' : 'Create schedule'}
            </Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Workflow Triggers</div>
          <div className="mt-2 text-xs text-muted">Automatically start a workflow when a task hits a status (worker executes).</div>
          <form onSubmit={onCreateTrigger} className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Workflow</span>
              <select
                className="min-w-[260px] rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)]"
                value={triggerWorkflowId}
                onChange={(e) => setTriggerWorkflowId(e.target.value)}
              >
                {workflows.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.kind || 'manual'})
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Status to</span>
              <select
                className="rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)]"
                value={triggerStatusTo}
                onChange={(e) => setTriggerStatusTo(e.target.value as any)}
              >
                <option value="inbox">inbox</option>
                <option value="assigned">assigned</option>
                <option value="in_progress">in_progress</option>
                <option value="review">review</option>
                <option value="done">done</option>
                <option value="blocked">blocked</option>
              </select>
            </div>
            <Input value={triggerLabelsAny} onChange={(e) => setTriggerLabelsAny(e.target.value)} placeholder="labelsAny (optional, comma-separated)" />
            <Input value={triggerSessionKey} onChange={(e) => setTriggerSessionKey(e.target.value)} placeholder="Session key (optional)" />
            <Textarea value={triggerVarsText} onChange={(e) => setTriggerVarsText(e.target.value)} className="min-h-[120px] font-mono text-xs" />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={triggerEnabled} onChange={(e) => setTriggerEnabled(e.target.checked)} />
              Enabled
            </label>
            <Button type="submit" disabled={creatingTrigger}>
              {creatingTrigger ? 'Creating…' : 'Create trigger'}
            </Button>
          </form>
        </div>
      </div>

      <div className="min-h-0 space-y-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Workflows</div>
            <div className="text-xs text-muted">{workflows.length}</div>
          </div>
          <div className="mt-4 space-y-3">
            {workflows.map((w) => (
              <div key={w.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{w.name}</div>
                    {w.description ? <div className="mt-1 text-xs text-muted">{w.description}</div> : null}
                    <div className="mt-2 text-xs text-muted font-mono">{w.id}</div>
                  </div>
                  <Badge className={cn('border-none', w.kind === 'lobster' ? 'bg-[var(--accent)] text-[var(--background)]' : '')}>
                    {w.kind || 'manual'}
                  </Badge>
                </div>
              </div>
            ))}
            {!workflows.length ? <div className="text-sm text-muted">No workflows yet.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Recent Runs</div>
            <div className="text-xs text-muted">{runs.length}</div>
          </div>
          <div className="mt-4 space-y-3">
            {runs.map((r) => (
              <details key={r.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <summary className="cursor-pointer">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {r.status || 'queued'}{' '}
                        <span className="text-xs text-muted">
                          {r.workflowId.slice(0, 8)}
                          {r.taskId ? ` · task ${r.taskId.slice(0, 8)}` : ''}
                        </span>
                      </div>
                      <div className="mt-1 text-xs text-muted">
                        {r.createdAt ? formatShortDate(r.createdAt) : ''} {r.sessionKey ? ` · ${r.sessionKey}` : ''}
                      </div>
                    </div>
                    <Badge className={cn('border-none', r.status === 'failed' ? 'bg-red-600 text-white' : r.status === 'succeeded' ? 'bg-emerald-600 text-white' : 'bg-[var(--accent)] text-[var(--background)]')}>
                      {r.status || 'queued'}
                    </Badge>
                  </div>
                </summary>
                {r.log ? (
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)]">
                    {r.log}
                  </pre>
                ) : null}
                {r.result ? (
                  <pre className="mt-3 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-3 text-xs text-[var(--foreground)]">
                    {pretty(r.result)}
                  </pre>
                ) : null}
              </details>
            ))}
            {!runs.length ? <div className="text-sm text-muted">No runs yet.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Schedules</div>
            <div className="text-xs text-muted">{schedules.length}</div>
          </div>
          <div className="mt-4 space-y-3">
            {schedules.map((s) => (
              <div key={s.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {String(s.workflowId).slice(0, 8)} · every {s.intervalMinutes ?? '—'} min
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {s.enabled ? 'enabled' : 'disabled'}
                      {s.running ? ` · running` : ''}
                      {s.nextRunAt ? ` · next ${formatShortDate(s.nextRunAt)}` : ''}
                    </div>
                    {s.taskId ? <div className="mt-1 text-xs text-muted">task {String(s.taskId).slice(0, 8)}</div> : null}
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void runScheduleNow(s)}
                      disabled={running}
                    >
                      Run now
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void toggleSchedule(s.id, !s.enabled)}
                    >
                      {s.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => void deleteSchedule(s.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!schedules.length ? <div className="text-sm text-muted">No schedules yet.</div> : null}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">Triggers</div>
            <div className="text-xs text-muted">{triggers.length}</div>
          </div>
          <div className="mt-4 space-y-3">
            {triggers.map((t) => (
              <div key={t.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {t.event || 'task_status_to'} → {t.statusTo || '—'} · {String(t.workflowId).slice(0, 8)}
                    </div>
                    <div className="mt-1 text-xs text-muted">{t.enabled ? 'enabled' : 'disabled'}</div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button type="button" size="sm" variant="secondary" onClick={() => void toggleTrigger(t.id, !t.enabled)}>
                      {t.enabled ? 'Disable' : 'Enable'}
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => void deleteTrigger(t.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            ))}
            {!triggers.length ? <div className="text-sm text-muted">No triggers yet.</div> : null}
          </div>
        </div>
      </div>
    </div>
  );
}
