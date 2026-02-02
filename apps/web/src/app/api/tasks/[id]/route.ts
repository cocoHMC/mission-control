import { pbFetch } from '@/lib/pbServer';
import { ensureTaskSubscription } from '@/lib/subscriptions';

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const task = await pbFetch(`/api/collections/tasks/records/${id}`);
  return Response.json(task);
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const before = await pbFetch(`/api/collections/tasks/records/${id}`);
  const updated = await pbFetch(`/api/collections/tasks/records/${id}`, {
    method: 'PATCH',
    body,
  });

  // Auto-subscribe newly-assigned agents.
  if (Array.isArray(body.assigneeIds)) {
    const beforeAssignees = new Set<string>(Array.isArray(before.assigneeIds) ? before.assigneeIds : []);
    const afterAssignees = new Set<string>(Array.isArray(updated.assigneeIds) ? updated.assigneeIds : []);
    const added = [...afterAssignees].filter((a) => !beforeAssignees.has(a));

    if (added.length) {
      await Promise.all(added.map((agentId) => ensureTaskSubscription({ taskId: id, agentId, reason: 'assigned' })));

      // Best-effort assignment notifications (v0: push via polling + /tools/invoke).
      await Promise.all(
        added.map((agentId) =>
          pbFetch('/api/collections/notifications/records', {
            method: 'POST',
            body: {
              toAgentId: agentId,
              taskId: id,
              content: `Assigned: ${updated.title}`,
              delivered: false,
            },
          }).catch(() => null)
        )
      );

      await pbFetch('/api/collections/activities/records', {
        method: 'POST',
        body: {
          type: 'assignment_change',
          actorAgentId: '',
          taskId: id,
          summary: `Assigned to: ${added.join(', ')}`,
        },
      }).catch(() => null);
    }
  }

  // Activity: status changes
  if (body.status && before.status !== body.status) {
    await pbFetch('/api/collections/activities/records', {
      method: 'POST',
      body: {
        type: 'status_change',
        actorAgentId: '',
        taskId: id,
        summary: `Status changed: ${before.status} → ${body.status}`,
      },
    });
  }

  return Response.json(updated);
}
