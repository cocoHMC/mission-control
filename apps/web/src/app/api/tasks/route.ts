import { pbFetch } from '@/lib/pbServer';

export async function GET() {
  const q = new URLSearchParams({ page: '1', perPage: '200' });
  const tasks = await pbFetch(`/api/collections/tasks/records?${q.toString()}`);
  return Response.json(tasks);
}

export async function POST(req: Request) {
  const body = await req.json();
  const created = await pbFetch('/api/collections/tasks/records', {
    method: 'POST',
    body: {
      title: body.title,
      description: body.description ?? '',
      status: body.status ?? 'inbox',
      priority: body.priority ?? 'p2',
      assigneeIds: body.assigneeIds ?? [],
      labels: body.labels ?? [],
      attemptCount: 0,
      maxAutoNudges: 3,
      escalationAgentId: 'jarvis',
    },
  });

  // v0: create notifications immediately on assignment (no realtime needed).
  const assignees: string[] = Array.isArray(created.assigneeIds) ? created.assigneeIds : [];
  for (const agentId of assignees) {
    await pbFetch('/api/collections/notifications/records', {
      method: 'POST',
      body: {
        toAgentId: agentId,
        taskId: created.id,
        content: `Assigned: ${created.title}`,
        delivered: false,
      },
    });
  }

  // Activity log
  await pbFetch('/api/collections/activities/records', {
    method: 'POST',
    body: {
      type: 'task_created',
      actorAgentId: '',
      taskId: created.id,
      summary: `Task created: ${created.title}`,
    },
  });

  // Auto-subscribe assignees
  await Promise.all(
    assignees.map((agentId) =>
      pbFetch('/api/collections/task_subscriptions/records', {
        method: 'POST',
        body: { taskId: created.id, agentId, reason: 'assigned' },
      }).catch(() => null)
    )
  );

  return Response.json(created);
}
