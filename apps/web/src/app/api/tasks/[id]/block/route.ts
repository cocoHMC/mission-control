import { pbFetch } from '@/lib/pbServer';

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const reason = String(body.reason || '').trim();
  const actor = String(body.actorAgentId || '').trim();

  if (!reason) return new Response('reason required', { status: 400 });

  const updated = await pbFetch(`/api/collections/tasks/records/${id}`, {
    method: 'PATCH',
    body: {
      status: 'blocked',
      lastProgressAt: new Date().toISOString(),
    },
  });

  await pbFetch('/api/collections/messages/records', {
    method: 'POST',
    body: {
      taskId: id,
      fromAgentId: actor,
      content: `BLOCKED: ${reason}`,
      mentions: [],
    },
  });

  await pbFetch('/api/collections/activities/records', {
    method: 'POST',
    body: {
      type: 'blocked',
      actorAgentId: actor,
      taskId: id,
      summary: `Marked blocked${actor ? ` by ${actor}` : ''}`,
    },
  });

  return Response.json(updated);
}
