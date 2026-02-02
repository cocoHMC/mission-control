'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

export default function NewTaskPage() {
  const r = useRouter();
  const [title, setTitle] = useState('');
  const [assignees, setAssignees] = useState('dev');

  async function submit() {
    const assigneeIds = assignees
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    const res = await fetch('/api/tasks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title, assigneeIds, status: assigneeIds.length ? 'assigned' : 'inbox' }),
    });
    if (!res.ok) throw new Error('failed');
    const created = await res.json();
    r.push(`/tasks/${created.id}`);
  }

  return (
    <div className="p-6 max-w-xl">
      <h1 className="text-2xl font-semibold mb-4">New Task</h1>
      <div className="space-y-3">
        <div>
          <div className="text-sm font-medium mb-1">Title</div>
          <input className="w-full rounded-md border p-2" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div>
          <div className="text-sm font-medium mb-1">Assignees (agentIds, comma-separated)</div>
          <input className="w-full rounded-md border p-2" value={assignees} onChange={(e) => setAssignees(e.target.value)} />
          <div className="text-xs text-gray-500 mt-1">Example: dev,ops,writer</div>
        </div>
        <button onClick={submit} className="rounded-md bg-black px-3 py-2 text-sm text-white">
          Create
        </button>
      </div>
    </div>
  );
}
