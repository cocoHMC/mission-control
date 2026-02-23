'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { CopyButton } from '@/components/ui/copy-button';
import { mcFetch } from '@/lib/clientApi';
import type { Workflow, WorkflowRun, WorkflowSchedule, WorkflowStepApproval, WorkflowTrigger } from '@/lib/types';
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

type WorkflowTraceEvent = {
  at?: string;
  stepIndex?: number;
  type?: string;
  status?: string;
  message?: string;
  output?: unknown;
};

type WorkflowRunTrace = {
  ok?: boolean;
  run?: WorkflowRun;
  workflow?: Workflow | null;
  approvals?: WorkflowStepApproval[];
  manualTrace?: WorkflowTraceEvent[];
  activities?: Array<{ id: string; type?: string; summary?: string; createdAt?: string }>;
  messages?: Array<{ id: string; content?: string; fromAgentId?: string; createdAt?: string }>;
  documents?: Array<{ id: string; title?: string; type?: string; createdAt?: string }>;
};

const MANUAL_PIPELINE_EXAMPLE = `{
  "steps": [
    {
      "type": "collect_human_input",
      "title": "Scope check",
      "instructions": "Confirm constraints and success criteria.",
      "reviewerAgentId": "coco"
    },
    {
      "type": "run_openclaw_tool",
      "tool": "lobster",
      "args": { "pipeline": "build-artifact" }
    },
    {
      "type": "verify_deliverable",
      "title": "QA review",
      "instructions": "Approve to publish. Reject to send task back in progress.",
      "reviewerAgentId": "coco"
    },
    {
      "type": "publish",
      "reason": "Deliverable approved and published."
    }
  ]
}`;

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

  const workflowNameById = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const w of workflows) map.set(w.id, w.name);
    return map;
  }, [workflows]);
  const lobsterWorkflows = React.useMemo(
    () => workflows.filter((workflow) => (safeString(workflow.kind) || 'manual') === 'lobster'),
    [workflows]
  );

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

  const [scheduleWorkflowId, setScheduleWorkflowId] = React.useState<string>(
    initialWorkflows.find((workflow) => (safeString(workflow.kind) || 'manual') === 'lobster')?.id || ''
  );
  const [scheduleInterval, setScheduleInterval] = React.useState('60');
  const [scheduleEnabled, setScheduleEnabled] = React.useState(true);
  const [scheduleTaskId, setScheduleTaskId] = React.useState('');
  const [scheduleSessionKey, setScheduleSessionKey] = React.useState('');
  const [scheduleVarsText, setScheduleVarsText] = React.useState('{}');
  const [scheduling, setScheduling] = React.useState(false);

  const [triggerWorkflowId, setTriggerWorkflowId] = React.useState<string>(
    initialWorkflows.find((workflow) => (safeString(workflow.kind) || 'manual') === 'lobster')?.id || ''
  );
  const [triggerEnabled, setTriggerEnabled] = React.useState(true);
  const [triggerEvent, setTriggerEvent] = React.useState<'task_status_to' | 'task_created' | 'task_due_soon'>('task_status_to');
  const [triggerStatusTo, setTriggerStatusTo] = React.useState<'inbox' | 'assigned' | 'in_progress' | 'review' | 'done' | 'blocked'>('review');
  const [triggerLabelsAny, setTriggerLabelsAny] = React.useState('');
  const [triggerProjectId, setTriggerProjectId] = React.useState('');
  const [triggerPriority, setTriggerPriority] = React.useState('');
  const [triggerAssigneeId, setTriggerAssigneeId] = React.useState('');
  const [triggerDueWithinMinutes, setTriggerDueWithinMinutes] = React.useState('60');
  const [triggerActionsText, setTriggerActionsText] = React.useState('{}');
  const [triggerSessionKey, setTriggerSessionKey] = React.useState('');
  const [triggerVarsText, setTriggerVarsText] = React.useState('{}');
  const [creatingTrigger, setCreatingTrigger] = React.useState(false);
  const [selectedRunId, setSelectedRunId] = React.useState('');
  const [traceByRunId, setTraceByRunId] = React.useState<Record<string, WorkflowRunTrace | null>>({});
  const [traceLoadingRunId, setTraceLoadingRunId] = React.useState('');
  const [runActionLoadingId, setRunActionLoadingId] = React.useState('');
  const [approvalNoteByRunId, setApprovalNoteByRunId] = React.useState<Record<string, string>>({});

  React.useEffect(() => {
    // Support deep links like /workflows?taskId=...&sessionKey=...&workflowId=...&run=...
    const qTaskId = String(params?.get('taskId') || '').trim();
    const qSessionKey = String(params?.get('sessionKey') || '').trim();
    const qWorkflowId = String(params?.get('workflowId') || '').trim();
    const qRunId = String(params?.get('run') || '').trim();

    if (qTaskId) setTaskId(qTaskId);
    if (qSessionKey) setSessionKey(qSessionKey);
    if (qWorkflowId) setRunWorkflowId(qWorkflowId);
    if (qRunId) {
      setSelectedRunId(qRunId);
    }
  }, [params]);

  React.useEffect(() => {
    if (!lobsterWorkflows.length) {
      if (scheduleWorkflowId) setScheduleWorkflowId('');
      return;
    }
    if (lobsterWorkflows.some((workflow) => workflow.id === scheduleWorkflowId)) return;
    setScheduleWorkflowId(lobsterWorkflows[0]?.id || '');
  }, [lobsterWorkflows, scheduleWorkflowId]);

  React.useEffect(() => {
    if (!lobsterWorkflows.length) {
      if (triggerWorkflowId) setTriggerWorkflowId('');
      return;
    }
    if (lobsterWorkflows.some((workflow) => workflow.id === triggerWorkflowId)) return;
    setTriggerWorkflowId(lobsterWorkflows[0]?.id || '');
  }, [lobsterWorkflows, triggerWorkflowId]);

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
    const nextRuns = Array.isArray(rr?.items) ? (rr.items as WorkflowRun[]) : [];
    setWorkflows(Array.isArray(wf?.items) ? wf.items : []);
    setRuns(nextRuns);
    setSchedules(Array.isArray(ss?.items) ? ss.items : []);
    setTriggers(Array.isArray(tt?.items) ? tt.items : []);
    if (selectedRunId && !nextRuns.some((run) => run.id === selectedRunId)) {
      setSelectedRunId('');
    }
  }

  async function loadRunTrace(runId: string, opts?: { force?: boolean }) {
    const normalizedRunId = safeString(runId);
    if (!normalizedRunId) return null;
    if (!opts?.force && Object.prototype.hasOwnProperty.call(traceByRunId, normalizedRunId)) {
      return traceByRunId[normalizedRunId] ?? null;
    }
    setTraceLoadingRunId(normalizedRunId);
    try {
      const res = await mcFetch(`/api/workflow-runs/${encodeURIComponent(normalizedRunId)}/trace`, { cache: 'no-store' });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Load trace failed (${res.status})`);
      setTraceByRunId((prev) => ({ ...prev, [normalizedRunId]: (json as WorkflowRunTrace) ?? null }));
      return (json as WorkflowRunTrace) ?? null;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
      setTraceByRunId((prev) => ({ ...prev, [normalizedRunId]: null }));
      return null;
    } finally {
      setTraceLoadingRunId((current) => (current === normalizedRunId ? '' : current));
    }
  }

  async function approveRun(runId: string, decision: 'approved' | 'rejected') {
    const normalizedRunId = safeString(runId);
    if (!normalizedRunId) return;
    setRunActionLoadingId(normalizedRunId);
    setError(null);
    try {
      const res = await mcFetch(`/api/workflow-runs/${encodeURIComponent(normalizedRunId)}/approval`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          decision,
          note: safeString(approvalNoteByRunId[normalizedRunId] || ''),
        }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Approval update failed (${res.status})`);
      await refresh();
      setSelectedRunId(normalizedRunId);
      await loadRunTrace(normalizedRunId, { force: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunActionLoadingId((current) => (current === normalizedRunId ? '' : current));
    }
  }

  async function resumeRun(runId: string) {
    const normalizedRunId = safeString(runId);
    if (!normalizedRunId) return;
    setRunActionLoadingId(normalizedRunId);
    setError(null);
    try {
      const res = await mcFetch(`/api/workflow-runs/${encodeURIComponent(normalizedRunId)}/resume`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
      });
      const json = await res.json().catch(() => null);
      if (!res.ok) throw new Error(json?.error || `Resume failed (${res.status})`);
      await refresh();
      setSelectedRunId(normalizedRunId);
      await loadRunTrace(normalizedRunId, { force: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunActionLoadingId((current) => (current === normalizedRunId ? '' : current));
    }
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
      const runId = safeString(json?.run?.id);
      if (runId) {
        setSelectedRunId(runId);
        await loadRunTrace(runId, { force: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function onCreateSchedule(e: React.FormEvent) {
    e.preventDefault();
    const wfId = safeString(scheduleWorkflowId);
    if (!wfId) {
      setError('No lobster workflow is available for scheduling.');
      return;
    }
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
      const runId = safeString(json?.run?.id);
      if (runId) {
        setSelectedRunId(runId);
        await loadRunTrace(runId, { force: true });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  }

  async function onCreateTrigger(e: React.FormEvent) {
    e.preventDefault();
    const wfId = safeString(triggerWorkflowId);
    if (!wfId) {
      setError('No lobster workflow is available for triggers.');
      return;
    }
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
      let actions: any = null;
      const actionsRaw = triggerActionsText.trim();
      if (actionsRaw) {
        try {
          actions = JSON.parse(actionsRaw);
        } catch {
          throw new Error('Trigger actions must be valid JSON.');
        }
      }
      const labelsAny = triggerLabelsAny
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      const dueWithinMinutes = Number.parseFloat(triggerDueWithinMinutes);
      const res = await mcFetch('/api/workflow-triggers', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          workflowId: wfId,
          enabled: triggerEnabled,
          event: triggerEvent,
          statusTo: triggerEvent === 'task_status_to' ? triggerStatusTo : '',
          labelsAny,
          projectId: triggerProjectId.trim(),
          priority: triggerPriority.trim().toLowerCase(),
          assigneeId: triggerAssigneeId.trim(),
          dueWithinMinutes: triggerEvent === 'task_due_soon' && Number.isFinite(dueWithinMinutes) ? dueWithinMinutes : null,
          actions,
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
              placeholder={kind === 'lobster' ? 'Lobster pipeline (YAML/JSON)' : MANUAL_PIPELINE_EXAMPLE}
              className="min-h-[140px] font-mono text-xs"
            />
            {kind === 'manual' ? (
              <div className="text-xs text-muted">
                Manual steps support <span className="font-mono">collect_human_input</span>, <span className="font-mono">verify_deliverable</span>,{' '}
                <span className="font-mono">wait_for_approval</span>, <span className="font-mono">set_task_status</span>,{' '}
                <span className="font-mono">publish</span>, <span className="font-mono">post_message</span>, and tool/lobster steps.
              </div>
            ) : null}
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
                disabled={!lobsterWorkflows.length}
              >
                {lobsterWorkflows.length ? (
                  lobsterWorkflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.kind || 'lobster'})
                    </option>
                  ))
                ) : (
                  <option value="">No lobster workflows available</option>
                )}
              </select>
            </div>
            {!lobsterWorkflows.length ? (
              <div className="text-xs text-muted">Create a lobster workflow first. Manual workflows are not schedulable.</div>
            ) : null}
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
            <Button type="submit" disabled={scheduling || !scheduleWorkflowId}>
              {scheduling ? 'Scheduling…' : 'Create schedule'}
            </Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Workflow Triggers</div>
          <div className="mt-2 text-xs text-muted">Rules engine: trigger on task events, apply conditions, then run workflow + optional actions.</div>
          <form onSubmit={onCreateTrigger} className="mt-4 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Workflow</span>
              <select
                className="min-w-[260px] rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)]"
                value={triggerWorkflowId}
                onChange={(e) => setTriggerWorkflowId(e.target.value)}
                disabled={!lobsterWorkflows.length}
              >
                {lobsterWorkflows.length ? (
                  lobsterWorkflows.map((w) => (
                    <option key={w.id} value={w.id}>
                      {w.name} ({w.kind || 'lobster'})
                    </option>
                  ))
                ) : (
                  <option value="">No lobster workflows available</option>
                )}
              </select>
            </div>
            {!lobsterWorkflows.length ? (
              <div className="text-xs text-muted">Create a lobster workflow first. Trigger execution is worker-driven.</div>
            ) : null}
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted">
              <span>Event</span>
              <select
                className="rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)]"
                value={triggerEvent}
                onChange={(e) => setTriggerEvent(e.target.value as any)}
              >
                <option value="task_status_to">task_status_to</option>
                <option value="task_created">task_created</option>
                <option value="task_due_soon">task_due_soon</option>
              </select>
            </div>
            {triggerEvent === 'task_status_to' ? (
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
            ) : null}
            {triggerEvent === 'task_due_soon' ? (
              <Input
                value={triggerDueWithinMinutes}
                onChange={(e) => setTriggerDueWithinMinutes(e.target.value)}
                placeholder="Due within minutes (e.g. 60)"
              />
            ) : null}
            <Input value={triggerLabelsAny} onChange={(e) => setTriggerLabelsAny(e.target.value)} placeholder="labelsAny (optional, comma-separated)" />
            <div className="grid gap-2 md:grid-cols-3">
              <Input value={triggerProjectId} onChange={(e) => setTriggerProjectId(e.target.value)} placeholder="projectId (optional)" />
              <select
                className="rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)]"
                value={triggerPriority}
                onChange={(e) => setTriggerPriority(e.target.value)}
              >
                <option value="">priority (any)</option>
                <option value="p0">p0</option>
                <option value="p1">p1</option>
                <option value="p2">p2</option>
                <option value="p3">p3</option>
              </select>
              <Input value={triggerAssigneeId} onChange={(e) => setTriggerAssigneeId(e.target.value)} placeholder="assigneeId (optional)" />
            </div>
            <Input value={triggerSessionKey} onChange={(e) => setTriggerSessionKey(e.target.value)} placeholder="Session key (optional)" />
            <Textarea value={triggerVarsText} onChange={(e) => setTriggerVarsText(e.target.value)} className="min-h-[120px] font-mono text-xs" />
            <Textarea
              value={triggerActionsText}
              onChange={(e) => setTriggerActionsText(e.target.value)}
              className="min-h-[120px] font-mono text-xs"
              placeholder='Actions JSON (optional), e.g. {"setStatus":"review","notifyLead":true}'
            />
            <label className="flex items-center gap-2 text-xs text-muted">
              <input type="checkbox" checked={triggerEnabled} onChange={(e) => setTriggerEnabled(e.target.checked)} />
              Enabled
            </label>
            <Button type="submit" disabled={creatingTrigger || !triggerWorkflowId}>
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
            {runs.map((r) => {
              const trace = traceByRunId[r.id];
              const approvals = Array.isArray(trace?.approvals) ? trace.approvals : [];
              const manualTrace = Array.isArray(trace?.manualTrace) ? trace.manualTrace : [];
              const activities = Array.isArray(trace?.activities) ? trace.activities : [];
              const messages = Array.isArray(trace?.messages) ? trace.messages : [];
              const documents = Array.isArray(trace?.documents) ? trace.documents : [];
              const pendingApproval =
                approvals.find((approval) => safeString(approval?.status).toLowerCase() === 'pending') || null;
              const isTraceLoading = traceLoadingRunId === r.id;
              const isRunBusy = runActionLoadingId === r.id;
              const isSelected = selectedRunId === r.id;
              const approvalNote = approvalNoteByRunId[r.id] || '';

              return (
                <details
                  key={r.id}
                  className={cn(
                    'rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4',
                    isSelected ? 'ring-1 ring-[var(--accent)]' : ''
                  )}
                >
                  <summary
                    className="cursor-pointer"
                    onClick={() => {
                      setSelectedRunId(r.id);
                      void loadRunTrace(r.id);
                    }}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-medium">
                          {r.status || 'queued'}{' '}
                          <span className="text-xs text-muted">
                            {(workflowNameById.get(r.workflowId) || r.workflowId).slice(0, 40)}
                            {r.taskId ? ` · task ${r.taskId.slice(0, 8)}` : ''}
                          </span>
                        </div>
                        <div className="mt-1 text-xs text-muted">
                          {r.createdAt ? formatShortDate(r.createdAt) : ''} {r.sessionKey ? ` · ${r.sessionKey}` : ''}
                        </div>
                      </div>
                      <Badge
                        className={cn(
                          'border-none',
                          r.status === 'failed'
                            ? 'bg-red-600 text-white'
                            : r.status === 'succeeded'
                              ? 'bg-emerald-600 text-white'
                              : 'bg-[var(--accent)] text-[var(--background)]'
                        )}
                      >
                        {r.status || 'queued'}
                      </Badge>
                    </div>
                  </summary>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        setSelectedRunId(r.id);
                        void loadRunTrace(r.id, { force: true });
                      }}
                      disabled={isTraceLoading}
                    >
                      {isTraceLoading ? 'Loading trace…' : 'Run trace'}
                    </Button>
                    {r.status !== 'succeeded' && r.status !== 'failed' ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => void resumeRun(r.id)}
                        disabled={isRunBusy}
                      >
                        {isRunBusy ? 'Working…' : 'Resume'}
                      </Button>
                    ) : null}
                  </div>
                  {r.commandId ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2 font-mono text-[var(--foreground)]">
                        {r.commandId}
                      </div>
                      <CopyButton value={r.commandId} label="Copy commandId" />
                    </div>
                  ) : null}
                  {isSelected && trace ? (
                    <div className="mt-3 space-y-3">
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Manual Step Trace</div>
                        {manualTrace.length ? (
                          <div className="mt-2 space-y-2">
                            {manualTrace.map((event, idx) => {
                              const outputText = event.output == null ? '' : pretty(event.output);
                              const outputPreview =
                                outputText.length > 800 ? `${outputText.slice(0, 800)}\n…truncated…` : outputText;
                              const eventStatus = safeString(event.status).toLowerCase();
                              return (
                                <div key={`${safeString(event.at)}-${idx}`} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                                  <div className="flex flex-wrap items-center justify-between gap-2">
                                    <div className="text-xs font-medium">
                                      {safeString(event.type) || 'step'} · step {(Number(event.stepIndex ?? 0) + 1).toString()}
                                    </div>
                                    <Badge
                                      className={cn(
                                        'border-none',
                                        eventStatus === 'failed' || eventStatus === 'rejected'
                                          ? 'bg-red-600 text-white'
                                          : eventStatus === 'approved' || eventStatus === 'succeeded'
                                            ? 'bg-emerald-600 text-white'
                                            : 'bg-[var(--accent)] text-[var(--background)]'
                                      )}
                                    >
                                      {event.status || 'event'}
                                    </Badge>
                                  </div>
                                  {safeString(event.message) ? (
                                    <div className="mt-1 text-xs text-muted">{safeString(event.message)}</div>
                                  ) : null}
                                  {safeString(event.at) ? (
                                    <div className="mt-1 text-[11px] text-muted">{formatShortDate(safeString(event.at))}</div>
                                  ) : null}
                                  {outputPreview ? (
                                    <pre className="mt-2 whitespace-pre-wrap rounded-md border border-[var(--border)] bg-[var(--card)] p-2 text-[11px] text-[var(--foreground)]">
                                      {outputPreview}
                                    </pre>
                                  ) : null}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-muted">No step trace events yet.</div>
                        )}
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="flex items-center justify-between gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
                          <span>Approvals</span>
                          <span>{approvals.length}</span>
                        </div>
                        {approvals.length ? (
                          <div className="mt-2 space-y-2">
                            {approvals.map((approval) => (
                              <div key={approval.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <div className="text-xs font-medium">
                                    {safeString(approval.title) || `Step ${(Number(approval.stepIndex ?? 0) + 1).toString()} approval`}
                                  </div>
                                  <Badge
                                    className={cn(
                                      'border-none',
                                      safeString(approval.status).toLowerCase() === 'rejected'
                                        ? 'bg-red-600 text-white'
                                        : safeString(approval.status).toLowerCase() === 'approved'
                                          ? 'bg-emerald-600 text-white'
                                          : 'bg-[var(--accent)] text-[var(--background)]'
                                    )}
                                  >
                                    {approval.status || 'pending'}
                                  </Badge>
                                </div>
                                {safeString(approval.instructions) ? (
                                  <div className="mt-1 text-xs text-muted">{safeString(approval.instructions)}</div>
                                ) : null}
                                {safeString(approval.decisionNote) ? (
                                  <div className="mt-1 text-xs text-muted">Decision note: {safeString(approval.decisionNote)}</div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="mt-2 text-xs text-muted">No approval records yet.</div>
                        )}
                        {pendingApproval ? (
                          <div className="mt-3 space-y-2 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                            <div className="text-xs font-medium">Pending decision</div>
                            <Textarea
                              value={approvalNote}
                              onChange={(event) =>
                                setApprovalNoteByRunId((prev) => ({
                                  ...prev,
                                  [r.id]: event.target.value,
                                }))
                              }
                              className="min-h-[84px] text-xs"
                              placeholder="Decision note (optional)"
                            />
                            <div className="flex flex-wrap items-center gap-2">
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => void approveRun(r.id, 'approved')}
                                disabled={isRunBusy}
                              >
                                {isRunBusy ? 'Working…' : 'Approve + resume'}
                              </Button>
                              <Button
                                type="button"
                                size="sm"
                                variant="destructive"
                                onClick={() => void approveRun(r.id, 'rejected')}
                                disabled={isRunBusy}
                              >
                                {isRunBusy ? 'Working…' : 'Reject'}
                              </Button>
                            </div>
                          </div>
                        ) : null}
                      </div>
                      <div className="rounded-xl border border-[var(--border)] bg-[var(--card)] p-3">
                        <div className="text-[11px] font-semibold uppercase tracking-wide text-muted">Run Artifacts</div>
                        <div className="mt-2 grid gap-2 text-xs md:grid-cols-3">
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                            <div className="font-medium">Activities</div>
                            <div className="mt-1 text-muted">{activities.length}</div>
                          </div>
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                            <div className="font-medium">Messages</div>
                            <div className="mt-1 text-muted">{messages.length}</div>
                          </div>
                          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-2">
                            <div className="font-medium">Documents</div>
                            <div className="mt-1 text-muted">{documents.length}</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}
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
              );
            })}
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
                      {(workflowNameById.get(String(s.workflowId)) || String(s.workflowId).slice(0, 8))} · every {s.intervalMinutes ?? '—'} min
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
                      {t.event || 'task_status_to'}
                      {t.statusTo ? ` → ${t.statusTo}` : ''}
                      {typeof t.dueWithinMinutes === 'number' && t.dueWithinMinutes > 0 ? ` (${t.dueWithinMinutes}m)` : ''} ·{' '}
                      {(workflowNameById.get(String(t.workflowId)) || String(t.workflowId).slice(0, 8)).slice(0, 48)}
                    </div>
                    <div className="mt-1 text-xs text-muted">
                      {t.enabled ? 'enabled' : 'disabled'}
                      {Array.isArray(t.labelsAny) && t.labelsAny.length ? ` · labelsAny: ${t.labelsAny.join(', ')}` : ''}
                      {safeString(t.projectId) ? ` · projectId: ${safeString(t.projectId)}` : ''}
                      {safeString(t.priority) ? ` · priority: ${safeString(t.priority)}` : ''}
                      {safeString(t.assigneeId) ? ` · assigneeId: ${safeString(t.assigneeId)}` : ''}
                    </div>
                    {t.actions ? (
                      <pre className="mt-2 whitespace-pre-wrap rounded-xl border border-[var(--border)] bg-[var(--card)] p-2 text-[11px] text-[var(--foreground)]">
                        {pretty(t.actions)}
                      </pre>
                    ) : null}
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
