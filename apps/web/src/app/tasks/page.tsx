/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from 'next/link';
import { pbFetch } from '@/lib/pbServer';

async function getTasks() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  const tasks = await pbFetch(`/api/collections/tasks/records?${q.toString()}`);
  return tasks;
}

function Col({ title, items }: { title: string; items: any[] }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <div className="mb-2 text-sm font-semibold">{title}</div>
      <div className="space-y-2">
        {items.map((t) => (
          <Link
            key={t.id}
            href={`/tasks/${t.id}`}
            className="block rounded-md border p-2 hover:bg-gray-50"
          >
            <div className="text-sm font-medium">{t.title}</div>
            <div className="text-xs text-gray-500">{t.priority ?? 'p2'}</div>
          </Link>
        ))}
        {!items.length && <div className="text-xs text-gray-400">Empty</div>}
      </div>
    </div>
  );
}

export default async function TasksPage() {
  const data = await getTasks();
  const items = data.items ?? [];

  const by = (status: string) => items.filter((t: any) => t.status === status);

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Mission Control</h1>
          <div className="text-sm text-gray-500">Kanban (v0)</div>
        </div>
        <Link className="rounded-md bg-black px-3 py-2 text-sm text-white" href="/tasks/new">
          New Task
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <Col title="Inbox" items={by('inbox')} />
        <Col title="Assigned" items={by('assigned')} />
        <Col title="In Progress" items={by('in_progress')} />
        <Col title="Review" items={by('review')} />
        <Col title="Blocked" items={by('blocked')} />
        <Col title="Done" items={by('done')} />
      </div>
    </div>
  );
}
