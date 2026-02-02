import { pbFetch } from '@/lib/pbServer';
import { ensureTaskSubscription } from '@/lib/subscriptions';

function parseMentions(text: string): string[] {
  const out = new Set<string>();
  const re = /@([a-zA-Z0-9_-]+)/g;
  for (const m of text.matchAll(re)) out.add(m[1]);
  return [...out];
}

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URLSearchParams({
    page: '1',
    perPage: '200',
    // messages.taskId is a plain text field
    filter: `taskId = "${id}"`,
  });
  const msgs = await pbFetch(`/api/collections/messages/records?${q.toString()}`);
  return Response.json(msgs);
}

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const content = String(body.content || '').trim();
  const fromAgentId = String(body.fromAgentId || '').trim();
  if (!content) return new Response('content required', { status: 400 });

  const mentions = parseMentions(content);
  const created = await pbFetch('/api/collections/messages/records', {
    method: 'POST',
    body: {
      taskId: id,
      fromAgentId,
      content,
      mentions,
    },
  });

  // Activity log
  await pbFetch('/api/collections/activities/records', {
    method: 'POST',
    body: {
      type: 'message',
      actorAgentId: fromAgentId,
      taskId: id,
      summary: `Message posted${fromAgentId ? ` by ${fromAgentId}` : ''}`,
    },
  });

  // Auto-subscribe commenter
  if (fromAgentId) await ensureTaskSubscription({ taskId: id, agentId: fromAgentId, reason: 'commented' });

  // Extend lease on any message (cheap enforcement hook)
  const leaseMinutes = Number(process.env.LEASE_MINUTES || 45);
  const leaseExpiresAt = new Date(Date.now() + leaseMinutes * 60_000).toISOString();
  await pbFetch(`/api/collections/tasks/records/${id}`, {
    method: 'PATCH',
    body: { lastProgressAt: new Date().toISOString(), leaseExpiresAt },
  });

  // Notify mentioned agents
  if (mentions.length) {
    const task = await pbFetch(`/api/collections/tasks/records/${id}`);

    // Mentioned agents are implicitly subscribers.
    await Promise.all(mentions.map((agentId) => ensureTaskSubscription({ taskId: id, agentId, reason: 'mentioned' })));

    await Promise.all(
      mentions.map((agentId) =>
        pbFetch('/api/collections/notifications/records', {
          method: 'POST',
          body: {
            toAgentId: agentId,
            taskId: id,
            content: `Mentioned on: ${task.title}`,
            delivered: false,
          },
        })
      )
    );
  }

  // Notify subscribers (excluding author + already-mentioned)
  const subsQ = new URLSearchParams({
    page: '1',
    perPage: '200',
    filter: `taskId = "${id}"`,
  });
  const subs = await pbFetch(`/api/collections/task_subscriptions/records?${subsQ.toString()}`);
  const mentionedSet = new Set(mentions);
  const subscribers: string[] = [...new Set((subs.items ?? []).map((s: any) => s.agentId).filter(Boolean))];
  const taskForSubs = await pbFetch(`/api/collections/tasks/records/${id}`);
  await Promise.all(
    subscribers
      .filter((a) => a !== fromAgentId)
      .filter((a) => !mentionedSet.has(a))
      .map((agentId) =>
        pbFetch('/api/collections/notifications/records', {
          method: 'POST',
          body: {
            toAgentId: agentId,
            taskId: id,
            content: `New update on: ${taskForSubs.title}`,
            delivered: false,
          },
        }).catch(() => null)
      )
  );

  return Response.json(created);
}
