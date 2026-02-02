import Link from 'next/link';
import { pbFetch } from '@/lib/pbServer';
import TaskDetailClient from './taskDetailClient';

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await pbFetch(`/api/collections/tasks/records/${id}`);
  const q = new URLSearchParams({ page: '1', perPage: '200', filter: `taskId = "${id}"` });
  const messages = await pbFetch(`/api/collections/messages/records?${q.toString()}`);

  return (
    <div className="p-6">
      <div className="mb-4">
        <Link className="text-sm underline" href="/tasks">
          ← Back
        </Link>
      </div>

      <TaskDetailClient task={task} messages={messages.items ?? []} />
    </div>
  );
}
