'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { formatShortDate } from '@/lib/utils';
import type { Agent, DocumentRecord, Message, NodeRecord, Task } from '@/lib/types';

const STATUSES = ['inbox', 'assigned', 'in_progress', 'review', 'blocked', 'done'];
type Status = (typeof STATUSES)[number];

export function TaskDetail({
  task,
  agents,
  messages,
  documents,
  nodes = [],
  onUpdated,
}: {
  task: Task;
  agents: Agent[];
  messages: Message[];
  documents: DocumentRecord[];
  nodes?: NodeRecord[];
  onUpdated?: () => void | Promise<void>;
}) {
  const router = useRouter();
  const leadAgentId = process.env.NEXT_PUBLIC_MC_LEAD_AGENT_ID || 'main';
  const [status, setStatus] = React.useState<Status>(task.status as Status);
  const [message, setMessage] = React.useState('');
  const [docTitle, setDocTitle] = React.useState('');
  const [docContent, setDocContent] = React.useState('');
  const [assignees, setAssignees] = React.useState<string[]>(task.assigneeIds ?? []);
  const [labelsInput, setLabelsInput] = React.useState((task.labels ?? []).join(', '));
  const [requiredNodeId, setRequiredNodeId] = React.useState(task.requiredNodeId ?? '');
  const [blockReason, setBlockReason] = React.useState('');
  const [archived, setArchived] = React.useState(Boolean(task.archived));

  React.useEffect(() => {
    setStatus(task.status);
    setAssignees(task.assigneeIds ?? []);
    setLabelsInput((task.labels ?? []).join(', '));
    setRequiredNodeId(task.requiredNodeId ?? '');
    setArchived(Boolean(task.archived));
  }, [task.id, task.status, task.assigneeIds, task.labels, task.requiredNodeId, task.archived]);

  async function updateTask(payload: Record<string, unknown>) {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function archiveTask(nextArchived: boolean) {
    await updateTask({ archived: nextArchived });
    setArchived(nextArchived);
  }

  async function deleteTask() {
    if (!window.confirm('Are you sure?')) return;
    await fetch(`/api/tasks/${task.id}`, { method: 'DELETE' });
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

  async function onSendMessage(event: React.FormEvent) {
    event.preventDefault();
    if (!message.trim()) return;
    await fetch('/api/messages', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, content: message, fromAgentId: leadAgentId }),
    });
    setMessage('');
    router.refresh();
    if (onUpdated) await onUpdated();
  }

  async function onCreateDoc(event: React.FormEvent) {
    event.preventDefault();
    if (!docTitle.trim()) return;
    await fetch('/api/documents', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ taskId: task.id, title: docTitle, content: docContent, type: 'deliverable' }),
    });
    setDocTitle('');
    setDocContent('');
    router.refresh();
    if (onUpdated) await onUpdated();
  }

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
          <div className="mt-4 text-sm text-muted">{task.description ? null : 'No description yet.'}</div>
          {task.description ? (
            <div className="mt-4 prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{task.description}</ReactMarkdown>
            </div>
          ) : null}
          {!!task.labels?.length && (
            <div className="mt-4 flex flex-wrap gap-2">
              {task.labels.map((label) => (
                <Badge key={label} className="border-none bg-[var(--highlight)] text-[var(--foreground)]">
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
            <Textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Add an update, @mention an agent, or paste a log." />
            <Button type="submit">Send update</Button>
          </form>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6">
          <div className="text-sm font-semibold">Documents</div>
          <div className="mt-4 space-y-3">
            {documents.map((doc) => (
              <div key={doc.id} className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
                <div className="text-xs uppercase tracking-[0.2em] text-muted">{doc.type}</div>
                <div className="mt-2 text-sm font-medium">{doc.title}</div>
                <div className="mt-2 text-xs text-muted">Updated {formatShortDate(doc.updated)}</div>
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
            className="mt-3 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
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
          <div className="text-sm font-semibold">Assignees</div>
          <div className="mt-3 space-y-2">
            {agents.map((agent) => {
              const key = agent.openclawAgentId ?? agent.id;
              const checked = assignees.includes(key) || assignees.includes(agent.id);
              return (
                <label key={agent.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-sm">
                  <input type="checkbox" checked={checked} onChange={() => onAssigneeToggle(key, agent.id)} />
                  {agent.displayName ?? agent.id}
                </label>
              );
            })}
          </div>
        </div>

        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 space-y-3">
          <div className="text-sm font-semibold">Task metadata</div>
          <div>
            <label className="text-xs uppercase tracking-[0.2em] text-muted">Required node</label>
            <select
              value={requiredNodeId}
              onChange={async (event) => {
                const value = event.target.value;
                setRequiredNodeId(value);
                await updateTask({ requiredNodeId: value || '' });
              }}
              className="mt-2 h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--card)] px-3 text-sm text-[var(--foreground)]"
            >
              <option value="">Any node</option>
              {nodes.map((node) => (
                <option key={node.id} value={node.nodeId ?? node.id}>
                  {node.displayName ?? node.nodeId ?? node.id}
                </option>
              ))}
            </select>
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
