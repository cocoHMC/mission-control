'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { mcFetch } from '@/lib/clientApi';
import type { Workflow, WorkflowRun } from '@/lib/types';
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

export function WorkflowsClient({ initialWorkflows, initialRuns }: { initialWorkflows: Workflow[]; initialRuns: WorkflowRun[] }) {
  const params = useSearchParams();
  const [workflows, setWorkflows] = React.useState<Workflow[]>(initialWorkflows);
  const [runs, setRuns] = React.useState<WorkflowRun[]>(initialRuns);

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
    setWorkflows(Array.isArray(wf?.items) ? wf.items : []);
    setRuns(Array.isArray(rr?.items) ? rr.items : []);
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
      </div>
    </div>
  );
}
