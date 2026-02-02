'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type Agent = { id: string; displayName?: string; openclawAgentId?: string };
type NodeRecord = { id: string; displayName?: string; nodeId?: string };

export function TaskForm({ agents, nodes }: { agents: Agent[]; nodes: NodeRecord[] }) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [title, setTitle] = React.useState('');
  const [description, setDescription] = React.useState('');
  const [priority, setPriority] = React.useState('p2');
  const [assignees, setAssignees] = React.useState<string[]>([]);
  const [labels, setLabels] = React.useState('');
  const [requiredNodeId, setRequiredNodeId] = React.useState('');

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    setPending(true);
    const labelList = labels
      .split(',')
      .map((label) => label.trim())
      .filter(Boolean);
    await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        title,
        description,
        priority,
        assigneeIds: assignees,
        status: assignees.length ? 'assigned' : 'inbox',
        labels: labelList,
        requiredNodeId: requiredNodeId || '',
      }),
    });
    setPending(false);
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
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="text-sm font-medium">Priority</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
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
          <label className="text-sm font-medium">Required node</label>
          <select
            className="mt-1 h-11 w-full rounded-xl border border-[var(--border)] bg-white px-3 text-sm"
            value={requiredNodeId}
            onChange={(event) => setRequiredNodeId(event.target.value)}
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
          <label className="text-sm font-medium">Assignees</label>
          <div className="mt-2 grid gap-2">
            {agents.map((agent) => {
              const key = agent.openclawAgentId ?? agent.id;
              const checked = assignees.includes(key) || assignees.includes(agent.id);
              return (
              <label key={agent.id} className="flex items-center gap-2 rounded-xl border border-[var(--border)] bg-white px-3 py-2 text-sm">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => toggleAssignee(key, agent.id)}
                />
                {agent.displayName ?? agent.id}
              </label>
            );})}
            {!agents.length && <div className="text-xs text-muted">No agents yet. Seed the lead agent in Settings.</div>}
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
      </div>
      <Button type="submit" size="lg" disabled={pending}>
        {pending ? 'Creating...' : 'Create task'}
      </Button>
    </form>
  );
}
