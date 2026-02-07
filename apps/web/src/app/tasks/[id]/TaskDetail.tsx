'use client';

import * as React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { MentionsTextarea } from '@/components/mentions/MentionsTextarea';
import { Textarea } from '@/components/ui/textarea';
import { CopyButton } from '@/components/ui/copy-button';
import { cn, formatShortDate, fromDateTimeLocalValue, toDateTimeLocalValue } from '@/lib/utils';
import type { Agent, DocumentRecord, Message, NodeRecord, Subtask, Task } from '@/lib/types';
import { mcFetch } from '@/lib/clientApi';

const STATUSES = ['inbox', 'assigned', 'in_progress', 'review', 'blocked', 'done'];
type Status = (typeof STATUSES)[number];

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

export function TaskDetail({
  task,
  agents,
  messages,
  documents,
  subtasks,
  nodes = [],
  onUpdated,
}: {
  task: Task;
  agents: Agent[];
  messages: Message[];
  documents: DocumentRecord[];
  subtasks: Subtask[];
  nodes?: NodeRecord[];
  onUpdated?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const leadAgentId = process.env.NEXT_PUBLIC_MC_LEAD_AGENT_ID || 'main';
  const [status, setStatus] = React.useState<Status>(task.status as Status);
  const [message, setMessage] = React.useState('');
  const [docTitle, setDocTitle] = React.useState('');
  const [docContent, setDocContent] = React.useState('');
  const [contextDraft, setContextDraft] = React.useState(task.context ?? '');
  const [editingContext, setEditingContext] = React.useState(false);
  const [assignees, setAssignees] = React.useState<string[]>(task.assigneeIds ?? []);
  const [labelsInput, setLabelsInput] = React.useState((task.labels ?? []).join(', '));
  const [requiredNodeId, setRequiredNodeId] = React.useState(task.requiredNodeId ?? '');
  const [blockReason, setBlockReason] = React.useState('');
  const [archived, setArchived] = React.useState(Boolean(task.archived));
  const [requiresReview, setRequiresReview] = React.useState(Boolean(task.requiresReview));
  const [startAt, setStartAt] = React.useState(toDateTimeLocalValue(task.startAt));
  const [dueAt, setDueAt] = React.useState(toDateTimeLocalValue(task.dueAt));
  const [subtaskItems, setSubtaskItems] = React.useState<Subtask[]>(subtasks ?? []);
  const [newSubtaskTitle, setNewSubtaskTitle] = React.useState('');
  const [openclawNodes, setOpenclawNodes] = React.useState<OpenClawNode[]>([]);

  const openclawAssigneeIds = React.useMemo(() => {
    const ids: string[] = [];
    const seen = new Set<string>();

    const lease = String(task.leaseOwnerAgentId || '').trim();
    if (lease && !seen.has(lease)) {
      seen.add(lease);
      ids.push(lease);
    }

    for (const pbId of assignees) {
      const found = agents.find((a) => a.id === pbId);
      const oc = found?.openclawAgentId;
      if (!oc) continue;
      if (seen.has(oc)) continue;
      seen.add(oc);
      ids.push(oc);
    }

    if (!ids.length && leadAgentId) ids.push(leadAgentId);
    return ids;
  }, [assignees, agents, leadAgentId, task.leaseOwnerAgentId]);

  const [chatAgentId, setChatAgentId] = React.useState(() => openclawAssigneeIds[0] || leadAgentId);

  React.useEffect(() => {
    setChatAgentId((prev) => {
      if (openclawAssigneeIds.includes(prev)) return prev;
      return openclawAssigneeIds[0] || leadAgentId;
    });
  }, [openclawAssigneeIds, leadAgentId]);

  React.useEffect(() => {
    setStatus(task.status);
    setAssignees(task.assigneeIds ?? []);
    setLabelsInput((task.labels ?? []).join(', '));
    setRequiredNodeId(task.requiredNodeId ?? '');
    setArchived(Boolean(task.archived));
    setRequiresReview(Boolean(task.requiresReview));
    setStartAt(toDateTimeLocalValue(task.startAt));
    setDueAt(toDateTimeLocalValue(task.dueAt));
    setContextDraft(task.context ?? '');
    setEditingContext(false);
  }, [
    task.id,
    task.status,
    task.assigneeIds,
    task.labels,
    task.requiredNodeId,
    task.archived,
    task.requiresReview,
    task.startAt,
    task.dueAt,
    task.context,
  ]);

  React.useEffect(() => {
    setSubtaskItems(subtasks ?? []);
  }, [task.id, subtasks]);

  React.useEffect(() => {
    // Best-effort live node list from OpenClaw for the node picker.
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

  async function updateTask(payload: Record<string, unknown>) {
    await mcFetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  const mentionables = React.useMemo(() => {
    return [
      { id: 'all', label: 'Notify lead' },
      ...agents
        .map((agent) => {
          const id = agent.openclawAgentId ?? agent.id;
          const label = agent.displayName ?? id;
          return { id, label };
        })
        .sort((a, b) => a.id.localeCompare(b.id)),
    ];
  }, [agents]);

  async function archiveTask(nextArchived: boolean) {
    await updateTask({ archived: nextArchived });
    setArchived(nextArchived);
  }

  async function saveContext() {
    await updateTask({ context: contextDraft });
    setEditingContext(false);
  }

  async function deleteTask() {
    if (!window.confirm('Are you sure?')) return;
    await mcFetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
    router.replace('/tasks');
  }

  async function onStatusChange(value: Status) {
    setStatus(value);
    await updateTask({ status: value });
  }

  async function onAssigneeToggle(id: string, fallbackId: string) {
    const has = assignees.includes(id) || assignees.includes(fallbackId);
    const next = assignees.filter((a) => a !== id && a !== fallbackId);
    if (!has) next.push(id);
    setAssignees(next);
    await updateTask({ assigneeIds: next, status: next.length ? 'assigned' : 'inbox' });
  }

  async function onClaimTask() {
    setStatus('in_progress');
    await updateTask({ status: 'in_progress', leaseOwnerAgentId: leadAgentId });
  }

  async function onBlockTask() {
    if (!blockReason.trim()) return;
    setStatus('blocked');
    await updateTask({ status: 'blocked', blockReason, blockActorId: leadAgentId });
    setBlockReason('');
  }

  async function onUpdateLabels() {
    const next = labelsInput
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);
    await updateTask({ labels: next });
  }

  async function onUpdateDates() {
    const nextStart = fromDateTimeLocalValue(startAt);
    const nextDue = fromDateTimeLocalValue(dueAt);
    await updateTask({
      startAt: nextStart || '',
      dueAt: nextDue || '',
    });
  }

  async function onToggleRequiresReview(next: boolean) {
    setRequiresReview(next);
    await updateTask({ requiresReview: next });
  }

  async function onSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    await mcFetch('/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, content: message, fromAgentId: leadAgentId }),
    });
    setMessage('');
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function createSubtask(event: React.FormEvent) {
    event.preventDefault();
    const title = newSubtaskTitle.trim();
    if (!title) return;
    await mcFetch('/api/subtasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, title }),
    });
    setNewSubtaskTitle('');
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function toggleSubtask(subtaskId: string, done: boolean) {
    setSubtaskItems((prev) => prev.map((s) => (s.id === subtaskId ? { ...s, done } : s)));
    await mcFetch(`/api/subtasks/${subtaskId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ done }),
    });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function deleteSubtask(subtaskId: string) {
    await mcFetch(`/api/subtasks/${subtaskId}`, { method: 'DELETE' });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function moveSubtask(subtaskId: string, dir: -1 | 1) {
    const sorted = [...subtaskItems].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    const idx = sorted.findIndex((s) => s.id === subtaskId);
    if (idx === -1) return;
    const swapIdx = idx + dir;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const a = sorted[idx];
    const b = sorted[swapIdx];
    const nextA = b.order ?? 0;
    const nextB = a.order ?? 0;
    setSubtaskItems((prev) =>
      prev.map((s) => {
        if (s.id === a.id) return { ...s, order: nextA };
        if (s.id === b.id) return { ...s, order: nextB };
        return s;
      })
    );
      await Promise.all([
      mcFetch(`/api/subtasks/${a.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: nextA }),
      }),
      mcFetch(`/api/subtasks/${b.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ order: nextB }),
      }),
    ]);
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function onCreateDoc(event: React.FormEvent) {
    event.preventDefault();
    if (!docTitle.trim()) return;
    await mcFetch('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, title: docTitle, content: docContent, type: 'deliverable' }),
    });
    setDocTitle('');
    setDocContent('');
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  const subtaskTotal = subtaskItems.length;
  const subtaskDone = subtaskItems.reduce((acc, s) => acc + (s.done ? 1 : 0), 0);
  const taskSessionKey = `agent:${chatAgentId}:mc:${task.id}`;

  return (
    <div className="grid gap-6 lg:grid-cols-[2fr,1fr]">
      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Task</div>
              <h2 className="mt-2 text-2xl font-semibold headline">{task.title}</h2>
            </div>
            <Badge className="border-none bg-[var(--accent)] text-[var(--background)]">{status.replace('_', ' ')}</Badge>
          </div>
          {(task.startAt || task.dueAt) && (
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted">
              {task.startAt && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                  starts {formatShortDate(task.startAt)}
                </span>
              )}
              {task.dueAt && (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">
                  due {formatShortDate(task.dueAt)}
                </span>
              )}
              {task.requiresReview ? (
                <span className="rounded-full border border-[var(--border)] bg-[var(--surface)] px-2 py-1">requires review</span>
              ) : null}
            </div>
          )}
          <div className="mt-4 text-sm text-muted">{task.description ? null : 'No description yet.'}</div>
          {task.description ? (
            <div className="mt-4 prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
            </div>
          ) : null}
          <details className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <summary className="cursor-pointer text-sm font-semibold text-[var(--foreground)]">Deep context</summary>
            <div className="mt-2 text-xs text-muted">
              Long-form Markdown context (research, articles, specs). Stored with the task and pulled by agents when needed.
            </div>
            {editingContext ? (
              <div className="mt-3 space-y-2">
                <Textarea
                  value={contextDraft}
                  onChange={(e) => setContextDraft(e.target.value)}
                  placeholder="Paste long context in Markdown..."
                  className="min-h-[240px]"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <Button type="button" size="sm" onClick={() => void saveContext()}>
                    Save context
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      setContextDraft(task.context ?? '');
                      setEditingContext(false);
                    }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : task.context ? (
              <div className="mt-3 prose prose-sm max-w-none">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.context}</ReactMarkdown>
              </div>
            ) : (
              <div className="mt-3 text-sm text-muted">No deep context yet.</div>
            )}
            {!editingContext ? (
              <div className="mt-3">
                <Button type="button" size="sm" variant="secondary" onClick={() => setEditingContext(true)}>
                  {task.context ? 'Edit' : 'Add'} context
                </Button>
              </div>
            ) : null}
          </details>

          <div className="mt-4 rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">OpenClaw Session</div>
                <div className="mt-1 text-xs text-muted">
                  Per-task session where Mission Control sends task notifications. Use this to ask for progress without
                  bloating your main chat.
                </div>
              </div>
              <Link
                href={`/sessions/${encodeURIComponent(taskSessionKey)}`}
              >
                <Button type="button" size="sm" variant="secondary">
                  Open chat
                </Button>
              </Link>
            </div>

            {openclawAssigneeIds.length > 1 ? (
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted">
                <span>Agent</span>
                <select
                  className="rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 py-2 text-xs text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
                  value={chatAgentId}
                  onChange={(e) => setChatAgentId(e.target.value)}
                >
                  {openclawAssigneeIds.map((id) => (
                    <option key={id} value={id}>
                      {id}
                    </option>
                  ))}
                </select>
              </div>
            ) : null}

            <div className="mt-3 flex items-center justify-between gap-2 rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 py-2">
              <div className="min-w-0 truncate font-mono text-xs text-[var(--foreground)]">{taskSessionKey}</div>
              <CopyButton value={taskSessionKey} label="Copy" />
            </div>
          </div>
          {!!task.labels?.length && (
            <div className="mt-4 flex flex-wrap gap-2">
              {task.labels.map((label) => (
                <Badge key={label} className="border-none">
                  {label}
                </Badge>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Thread</div>
          <div className="mt-4 space-y-4">
            {messages.map((msg) => (
              <div key={msg.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">{msg.fromAgentId || 'human'}</div>
                <div className="mt-2 text-sm whitespace-pre-wrap">{msg.content}</div>
              </div>
            ))}
            {!messages.length && <div className="text-sm text-muted">No messages yet.</div>}
          </div>
          <form onSubmit={onSendMessage} className="mt-6 space-y-3">
            <MentionsTextarea
              value={message}
              onChange={setMessage}
              mentionables={mentionables}
              placeholder="Add an update, @mention an agent, or paste a log."
            />
            <Button type="submit">Send update</Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="flex items-center justify-between gap-4">
            <div className="text-sm font-semibold">Subtasks</div>
            <div className="text-xs text-muted">
              {subtaskDone}/{subtaskTotal}
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {[...subtaskItems]
              .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
              .map((s, idx, arr) => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm"
                >
                  <input type="checkbox" checked={Boolean(s.done)} onChange={(e) => void toggleSubtask(s.id, e.target.checked)} />
                  <div className={cn('flex-1', s.done ? 'line-through text-muted' : '')}>{s.title}</div>
                  <div className="flex items-center gap-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void moveSubtask(s.id, -1)}
                      disabled={idx === 0}
                    >
                      Up
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => void moveSubtask(s.id, 1)}
                      disabled={idx === arr.length - 1}
                    >
                      Down
                    </Button>
                    <Button type="button" size="sm" variant="destructive" onClick={() => void deleteSubtask(s.id)}>
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            {!subtaskItems.length && <div className="text-sm text-muted">No subtasks yet.</div>}
          </div>
          <form onSubmit={createSubtask} className="mt-4 flex items-center gap-2">
            <Input value={newSubtaskTitle} onChange={(e) => setNewSubtaskTitle(e.target.value)} placeholder="New subtask..." />
            <Button type="submit" variant="secondary">
              Add
            </Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Documents</div>
          <div className="mt-4 space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">{doc.type}</div>
                <div className="mt-2 text-sm font-medium">{doc.title}</div>
                <div className="mt-2 text-xs text-muted">Updated {formatShortDate(doc.updatedAt)}</div>
              </div>
            ))}
            {!documents.length && <div className="text-sm text-muted">No documents yet.</div>}
          </div>
          <form onSubmit={onCreateDoc} className="mt-6 space-y-3">
            <Input value={docTitle} onChange={(event) => setDocTitle(event.target.value)} placeholder="Document title" />
            <Textarea value={docContent} onChange={(event) => setDocContent(event.target.value)} placeholder="Document content (Markdown)" />
            <Button type="submit" variant="secondary">Create doc</Button>
          </form>
        </div>
      </div>

      <div className="space-y-6">
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Status</div>
          <select
            value={status}
            onChange={(event) => onStatusChange(event.target.value as Status)}
            className="mt-3 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s.replace('_', ' ')}
              </option>
            ))}
          </select>
          <div className="mt-4 space-y-2 text-xs text-muted">
            <div>Lease owner: {task.leaseOwnerAgentId || 'unclaimed'}</div>
            <div>Lease expires: {task.leaseExpiresAt ? formatShortDate(task.leaseExpiresAt) : 'n/a'}</div>
            <div>Attempt count: {task.attemptCount ?? 0}</div>
          </div>
          <div className="mt-4 flex flex-col gap-2">
            <Button type="button" variant="secondary" onClick={onClaimTask} disabled={status === 'in_progress' || status === 'done'}>
              Claim task
            </Button>
            <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Block</div>
              <Textarea
                value={blockReason}
                onChange={(event) => setBlockReason(event.target.value)}
                placeholder="Reason + next action"
                className="mt-2"
              />
              <Button type="button" size="sm" className="mt-2" onClick={onBlockTask}>
                Block with reason
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Assignee agents</div>
          <div className="mt-3 space-y-2">
            {agents.map((agent) => {
              const key = agent.openclawAgentId ?? agent.id;
              const checked = assignees.includes(key) || assignees.includes(agent.id);
              return (
                <label key={agent.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                  <input type="checkbox" checked={checked} onChange={() => onAssigneeToggle(key, agent.id)} />
                  <span className="flex-1">{agent.displayName ?? agent.id}</span>
                  <span className="font-mono text-xs text-muted">@{key}</span>
                </label>
              );
            })}
          </div>
          <div className="mt-2 text-xs text-muted">
            Agents are OpenClaw personas (brains). Manage them on the{' '}
            <Link href="/agents" className="underline underline-offset-2">
              Agents
            </Link>{' '}
            page.
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-3">
          <div className="text-sm font-semibold">Task metadata</div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="flex items-center justify-between gap-4">
              <div>
                <div className="text-xs uppercase tracking-[0.2em] text-muted">Review policy</div>
                <div className="mt-1 text-sm">{requiresReview ? 'Requires review' : 'Auto-done'}</div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={requiresReview} onChange={(e) => void onToggleRequiresReview(e.target.checked)} />
                Requires review
              </label>
            </div>
          </div>
          <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="text-xs uppercase tracking-[0.2em] text-muted">Dates</div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Start</label>
                <Input type="datetime-local" value={startAt} onChange={(e) => setStartAt(e.target.value)} className="mt-2" />
              </div>
              <div>
                <label className="text-xs uppercase tracking-[0.2em] text-muted">Due</label>
                <Input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} className="mt-2" />
              </div>
            </div>
            <Button type="button" size="sm" variant="secondary" className="mt-3" onClick={onUpdateDates}>
              Save dates
            </Button>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Execution device (optional)</label>
            <select
              value={requiredNodeId}
              onChange={async (event) => {
                const value = event.target.value;
                setRequiredNodeId(value);
                await updateTask({ requiredNodeId: value || '' });
              }}
              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--input)] px-3 text-sm text-[var(--foreground)] focus:ring-2 focus:ring-[var(--ring)]"
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
              Nodes are paired devices from OpenClaw. Sync nodes on the{' '}
              <Link href="/nodes" className="underline underline-offset-2">
                Nodes
              </Link>{' '}
              page.
            </div>
          </div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Labels</label>
            <Input
              value={labelsInput}
              onChange={(event) => setLabelsInput(event.target.value)}
              placeholder="comma, separated, tags"
              className="mt-2"
            />
            <Button type="button" size="sm" variant="secondary" className="mt-2" onClick={onUpdateLabels}>
              Save labels
            </Button>
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-3">
          <div className="text-sm font-semibold">Task actions</div>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="secondary" onClick={() => archiveTask(!archived)}>
              {archived ? 'Unarchive' : 'Archive'}
            </Button>
            <Button type="button" size="sm" variant="destructive" onClick={deleteTask}>
              Delete
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
