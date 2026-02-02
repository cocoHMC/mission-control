import { pbFetch } from '@/lib/pbServer';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const agentId = String(body.agentId || '').trim();
  if (!agentId) return new Response('agentId required', { status: 400 });

  const leaseMinutes = Number(process.env.LEASE_MINUTES || 45);
  const now = new Date();

  const updated = await pbFetch(`/api/collections/tasks/records/${id}`, {
    method: 'PATCH',
    body: {
      status: 'in_progress',
      leaseOwnerAgentId: agentId,
      lastProgressAt: now.toISOString(),
      leaseExpiresAt: new Date(now.getTime() + leaseMinutes * 60_000).toISOString(),
      attemptCount: 0,
      maxAutoNudges: 3,
      escalationAgentId: 'jarvis',
    },
  });

  // Activity log
  await pbFetch('/api/collections/activities/records', {
    method: 'POST',
    body: {
      type: 'task_claimed',
      actorAgentId: agentId,
      taskId: id,
      summary: `Task claimed by ${agentId}`,
    },
  });

  // Subscribe assignee implicitly
  await pbFetch('/api/collections/task_subscriptions/records', {
    method: 'POST',
    body: { taskId: id, agentId, reason: 'assigned' },
  });

  return Response.json(updated);
}
