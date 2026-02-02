'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';

type Task = {
  id: string;
  title: string;
  status: string;
  priority?: string;
  assigneeIds?: string[];
  leaseOwnerAgentId?: string;
  leaseExpiresAt?: string;
};

type Msg = {
  id: string;
  fromAgentId?: string;
  content: string;
  created?: string;
};

function fmtTime(s?: string) {
  if (!s) return '';
  const d = new Date(s);
  return isNaN(d.getTime()) ? s : d.toLocaleString();
}

export default function TaskDetailClient({ task, messages }: { task: Task; messages: Msg[] }) {
  const r = useRouter();
  const [agentId, setAgentId] = useState(task.leaseOwnerAgentId || (task.assigneeIds?.[0] ?? 'dev'));
  const [msg, setMsg] = useState('');
  const [blockReason, setBlockReason] = useState('');

  const status = task.status;
  const header = useMemo(() => {
    return `${task.title}`;
  }, [task.title]);

  async function patch(body: any) {
    await fetch(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    r.refresh();
  }

  async function claim() {
    await fetch(`/api/tasks/${task.id}/claim`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ agentId }),
    });
    r.refresh();
  }

  async function postMessage() {
    const content = msg.trim();
    if (!content) return;
    await fetch(`/api/tasks/${task.id}/messages`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fromAgentId: agentId, content }),
    });
    setMsg('');
    r.refresh();
  }

  async function block() {
    const reason = blockReason.trim();
    if (!reason) return;
    await fetch(`/api/tasks/${task.id}/block`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ actorAgentId: agentId, reason }),
    });
    setBlockReason('');
    r.refresh();
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border bg-white p-4">
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{header}</h1>
            <div className="text-sm text-gray-500">Task {task.id}</div>
          </div>
          <div className="flex items-center gap-2">
            <input
              className="w-40 rounded-md border p-2 text-sm"
              value={agentId}
              onChange={(e) => setAgentId(e.target.value)}
              placeholder="agentId (dev)"
            />
            <button className="rounded-md bg-black px-3 py-2 text-sm text-white" onClick={claim}>
              Claim
            </button>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-2 text-xs">
          <span className="rounded-full bg-gray-100 px-2 py-1">status: {status}</span>
          {task.priority && <span className="rounded-full bg-gray-100 px-2 py-1">priority: {task.priority}</span>}
          {task.leaseOwnerAgentId && <span className="rounded-full bg-gray-100 px-2 py-1">owner: {task.leaseOwnerAgentId}</span>}
          {task.leaseExpiresAt && <span className="rounded-full bg-gray-100 px-2 py-1">lease: {fmtTime(task.leaseExpiresAt)}</span>}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => patch({ status: 'assigned' })}>
            Assigned
          </button>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => patch({ status: 'in_progress' })}>
            In Progress
          </button>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => patch({ status: 'review' })}>
            Review
          </button>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => patch({ status: 'blocked' })}>
            Blocked (no reason)
          </button>
          <button className="rounded-md border px-3 py-2 text-sm" onClick={() => patch({ status: 'done' })}>
            Done
          </button>
        </div>

        <div className="mt-3 flex gap-2">
          <input
            className="flex-1 rounded-md border p-2 text-sm"
            value={blockReason}
            onChange={(e) => setBlockReason(e.target.value)}
            placeholder="If blocked, enter reason (required)"
          />
          <button className="rounded-md bg-black px-3 py-2 text-sm text-white" onClick={block}>
            Mark Blocked
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4">
        <div className="mb-2 text-sm font-semibold">Thread</div>
        <div className="space-y-3">
          {messages.map((m) => (
            <div key={m.id} className="rounded-md border p-3">
              <div className="text-xs text-gray-500">
                {m.fromAgentId || 'human'} · {fmtTime(m.created)}
              </div>
              <div className="mt-1 whitespace-pre-wrap text-sm">{m.content}</div>
            </div>
          ))}
          {!messages.length && <div className="text-sm text-gray-500">No messages yet.</div>}
        </div>

        <div className="mt-3 flex gap-2">
          <textarea
            className="min-h-[70px] flex-1 rounded-md border p-2 text-sm"
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="Write an update… (use @dev @ops etc)"
          />
          <button className="h-[70px] rounded-md bg-black px-3 text-sm text-white" onClick={postMessage}>
            Post
          </button>
        </div>
      </div>
    </div>
  );
}
