'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { fromDateTimeLocalValue } from '@/lib/utils';
import { mcFetch } from '@/lib/clientApi';

type Agent = { id: string; displayName?: string; openclawAgentId?: string };
type NodeRecord = { id: string; displayName?: string; nodeId?: string };
type OpenClawNode = {
  nodeId?: string;
  displayName?: string;
  remoteIp?: string;
  platform?: string;
  paired?: boolean;
  connected?: boolean;
};
type OpenClawNodesStatus = {
  nodes?: OpenClawNode[];
};

export function TaskForm({
  agents,
  nodes,
  onCreated,
}: {
  agents: Agent[];
  nodes: NodeRecord[];
  onCreated?: (taskId?: string) => void;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [context, setContext] = React.useState('');
  const [priority, setPriority] = React.useState('p2');
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [labels, setLabels] = React.useState('');
  const [requiredNodeId, setRequiredNodeId] = React.useState('');
  const [startAt, setStartAt] = React.useState('');
  const [dueAt, setDueAt] = React.useState('');
  const [requiresReview, setRequiresReview] = React.useState(false);
  const [subtasks, setSubtasks] = React.useState<{ id: string; title: string }[]>([]);
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState('');
  const [openclawNodes, setOpenclawNodes] = React.useState<OpenClawNode[]>([]);

  React.useEffect(() => {
    // Best-effort live node list from OpenClaw (no PocketBase sync required).
    // Falls back to Mission Control's nodes collection if OpenClaw CLI is unavailable.
    let cancelled = false;
    mcFetch('/api/openclaw/nodes/status', { cache: 'no-store' })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok) return;
        const next = (json?.status as OpenClawNodesStatus) || null;
        const list = Array.isArray(next?.nodes) ? next!.nodes! : [];
        setOpenclawNodes(list.filter((n) => n && n.nodeId));
      })
      .catch(() => {
        // ignore
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function makeLocalId() {
    try {
      // Browser only (this is a client component).
      return crypto.randomUUID();
    } catch {
      return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
    }
  }

  function addSubtask() {
    const t = newSubtaskTitle.trim();
    if (!t) return;
    setSubtasks((prev) => [...prev, { id: makeLocalId(), title: t }]);
    setNewSubtaskTitle('');
  }

  function removeSubtask(id: string) {
    setSubtasks((prev) => prev.filter((s) => s.id !== id));
  }

  function moveSubtask(id: string, dir: -1 | 1) {
    setSubtasks((prev) => {
      const idx = prev.findIndex((s) => s.id === id);
      if (idx === -1) return prev;
      const swapIdx = idx + dir;
      if (swapIdx < 0 || swapIdx >= prev.length) return prev;
      const next = [...prev];
      const tmp = next[idx];
      next[idx] = next[swapIdx];
      next[swapIdx] = tmp;
      return next;
    });
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    const labelList = labels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);
    const res = await mcFetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        context,
        priority,
        assigneeIds: assignees,
        status: assignees.length ? 'assigned' : 'inbox',
        labels: labelList,
        requiredNodeId: requiredNodeId || '',
        startAt: fromDateTimeLocalValue(startAt) || '',
        dueAt: fromDateTimeLocalValue(dueAt) || '',
        requiresReview,
      }),
    });
    if (!res.ok) {
      setPending(false);
      return;
    }
    const created = await res.json().catch(() => null);
    const taskId = created?.id as string | undefined;

    if (taskId && subtasks.length) {
      // Create initial subtasks deterministically (no LLM). We do this after creating
      // the task so we have the real taskId.
      const baseOrder = Date.now();
      for (let i = 0; i < subtasks.length; i++) {
        const s = subtasks[i];
        if (!s?.title?.trim()) continue;
        await mcFetch('/api/subtasks', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ taskId, title: s.title.trim(), order: baseOrder + i }),
        });
      }
      // Update aggregate fields immediately so the board shows progress without waiting
      // for the worker to recompute.
      await mcFetch(`/api/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subtasksTotal: subtasks.length, subtasksDone: 0 }),
      });
    }
    setPending(false);
    if (onCreated) {
      onCreated(taskId);
      router.refresh();
      return;
    }
    router.push('/tasks');
    router.refresh();
  }

  function toggleAssignee(id: string, fallbackId: string) {
    setAssignees((prev) => {
      const has = prev.includes(id) || prev.includes(fallbackId);
      const next = prev.filter((a) => a !== id && a !== fallbackId);
      if (!has) next.push(id);
      return next;
    });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div>
        <label className="text-sm font-medium">Title</label>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Ship OpenClaw node onboarding" />
      </div>
      <div>
        <label className="text-sm font-medium">Description</label>
        <Textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Context, success criteria, or links." />
      </div>
      <details className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <summary className="cursor-pointer text-sm font-medium text-[var(--foreground)]">Deep context (optional)</summary>
        <div className="mt-2 text-xs text-muted">
          Paste long Markdown context (research, articles, specs). Mission Control won&apos;t push this into agent chats
          automatically—agents should pull it when needed to avoid token spikes.
        </div>
        <Textarea
          value={context}
          onChange={(event) => setContext(event.target.value)}
          placeholder="Long context in Markdown..."
          className="mt-3 min-h-[200px]"
        />
      </details>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Priority</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            value={priority}
            onChange={(event) => setPriority(event.target.value)}
          >
            {['p0', 'p1', 'p2', 'p3'].map((p) => (
              <option key={p} value={p}>
                {p.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-sm font-medium">Execution device (optional)</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
            value={requiredNodeId}
            onChange={(event) => setRequiredNodeId(event.target.value)}
          >
            <option value="">Gateway (this machine)</option>
            {(openclawNodes.length
              ? openclawNodes.map((n) => ({
                  id: n.nodeId || '',
                  label: `${n.displayName || n.nodeId}${n.remoteIp ? ` (${n.remoteIp})` : ''}`,
                }))
              : nodes.map((node) => ({
                  id: node.nodeId ?? node.id,
                  label: node.displayName ?? node.nodeId ?? node.id,
                }))
            ).map((node) => (
              <option key={node.id} value={node.id}>
                {node.label}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-muted">
            Nodes are paired devices from OpenClaw. This does <span className="font-medium text-[var(--foreground)]">not</span> change who is assigned.
            Sync nodes on the <Link href="/nodes" className="underline underline-offset-2">Nodes</Link> page.
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Assignee agents</label>
          <div className="mt-2 grid gap-2">
            {agents.map((agent) => {
              const key = agent.openclawAgentId ?? agent.id;
              const checked = assignees.includes(key) || assignees.includes(agent.id);
              return (
              <label key={agent.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAssignee(key, agent.id)}
                />
                <span className="flex-1">{agent.displayName ?? agent.id}</span>
                <span className="font-mono text-xs text-muted">@{key}</span>
              </label>
            );})}
            {!agents.length && (
              <div className="text-xs text-muted">
                No agents yet. Create one on the <Link href="/agents" className="underline underline-offset-2">Agents</Link> page.
              </div>
            )}
          </div>
          <div className="mt-2 text-xs text-muted">
            Agents are OpenClaw personas (brains). Add more on the <Link href="/agents" className="underline underline-offset-2">Agents</Link> page.
          </div>
        </div>
        <div>
          <label className="text-sm font-medium">Labels</label>
          <Input
            value={labels}
            onChange={(event) => setLabels(event.target.value)}
            placeholder="comma, separated, tags"
            className="mt-2"
          />
        </div>
        <div>
          <label className="text-sm font-medium">Start</label>
          <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-2" />
        </div>
        <div>
          <label className="text-sm font-medium">Due</label>
          <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-2" />
        </div>
        <div className="sm:col-span-2">
          <label className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-3 text-sm">
            <input type="checkbox" checked={requiresReview} onChange={(e) => setRequiresReview(e.target.checked)} />
            Requires review (otherwise auto-done)
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
        <div className="flex items-center justify-between gap-4">
          <div className="text-sm font-semibold">Subtasks</div>
          <div className="text-xs text-muted">{subtasks.length}</div>
        </div>
        <div className="mt-4 space-y-2">
          {subtasks.map((s, idx) => (
            <div
              key={s.id}
              className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
            >
              <div className="flex-1">{s.title}</div>
              <div className="flex items-center gap-1">
                <Button type="button" size="sm" variant="secondary" onClick={() => moveSubtask(s.id, -1)} disabled={idx === 0}>
                  Up
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="secondary"
                  onClick={() => moveSubtask(s.id, 1)}
                  disabled={idx === subtasks.length - 1}
                >
                  Down
                </Button>
                <Button type="button" size="sm" variant="destructive" onClick={() => removeSubtask(s.id)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {!subtasks.length ? <div className="text-sm text-muted">No subtasks yet.</div> : null}
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Input
            value={newSubtaskTitle}
            onChange={(e) => setNewSubtaskTitle(e.target.value)}
            placeholder="New subtask..."
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                addSubtask();
              }
            }}
          />
          <Button type="button" variant="secondary" onClick={addSubtask} disabled={!newSubtaskTitle.trim()}>
            Add
          </Button>
        </div>
      </div>

      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Creating...' : 'Create task'}
      </Button>
    </form>
  );
}
