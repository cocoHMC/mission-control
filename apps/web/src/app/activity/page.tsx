/* eslint-disable @typescript-eslint/no-explicit-any */

import Link from 'next/link';
import { pbFetch } from '@/lib/pbServer';

export default async function ActivityPage() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  const data = await pbFetch(`/api/activity?${q.toString()}`);
  const items = (data.items ?? []) as any[];

  return (
    <div className="p-6">
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Activity</h1>
          <div className="text-sm text-gray-500">Append-only log (v0)</div>
        </div>
        <Link className="text-sm underline" href="/tasks">
          Back to Tasks
        </Link>
      </div>

      <div className="space-y-2">
        {items.map((a) => (
          <div key={a.id} className="rounded-md border bg-white p-3">
            <div className="text-xs text-gray-500">
              {a.type} {a.taskId ? `· task ${a.taskId}` : ''}
            </div>
            <div className="mt-1 text-sm">{a.summary}</div>
          </div>
        ))}
        {!items.length && <div className="text-sm text-gray-500">No activity yet.</div>}
      </div>
    </div>
  );
}
