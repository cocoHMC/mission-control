import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { ensureTaskSubscription } from '@/lib/subscriptions';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/tasks/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { blockReason, blockActorId } = body ?? {};
  const payload = { ...body };
  delete payload.blockReason;
  delete payload.blockActorId;
  const now = new Date();
  payload.updatedAt = now.toISOString();
  if (payload.status) {
    if (payload.status === 'done') {
      payload.lastProgressAt = now.toISOString();
      payload.completedAt = payload.completedAt ?? now.toISOString();
      payload.leaseExpiresAt = payload.leaseExpiresAt ?? '';
    } else {
      payload.lastProgressAt = now.toISOString();
      // If a task is moved back out of done, clear completedAt unless explicitly set.
      if (payload.status !== 'done' && payload.completedAt === undefined) payload.completedAt = '';
    }
  }
  const isClaim = payload.status === 'in_progress' && !!payload.leaseOwnerAgentId;
  if (isClaim) {
    const leaseMinutes = Number(process.env.LEASE_MINUTES || 45);
    if (!payload.leaseExpiresAt) {
      payload.leaseExpiresAt = new Date(now.getTime() + leaseMinutes * 60_000).toISOString();
    }
    if (payload.attemptCount == null) payload.attemptCount = 0;
    if (payload.maxAutoNudges == null) payload.maxAutoNudges = 3;
    if (!payload.escalationAgentId) {
      payload.escalationAgentId = process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'coco';
    }
  }
  const updated = await pbFetch(`/api/collections/tasks/records/${id}`, { method: 'PATCH', body: payload });

  if (payload.status === 'blocked' && blockReason) {
    await pbFetch('/api/collections/messages/records', {
      method: 'POST',
      body: {
        taskId: id,
        fromAgentId: blockActorId ?? '',
        content: `BLOCKED: ${blockReason}`,
        mentions: [],
        createdAt: now.toISOString(),
        updatedAt: now.toISOString(),
      },
    });
  }

  if (isClaim && payload.leaseOwnerAgentId) {
    await pbFetch('/api/collections/activities/records', {
      method: 'POST',
      body: {
        type: 'task_claimed',
        actorAgentId: payload.leaseOwnerAgentId,
        taskId: id,
        summary: `Task claimed by ${payload.leaseOwnerAgentId}`,
        createdAt: now.toISOString(),
      },
    });
    await ensureTaskSubscription({ taskId: id, agentId: payload.leaseOwnerAgentId, reason: 'assigned' });
  }

  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  async function deleteRelated(collection: string, filter: string) {
    let page = 1;
    while (true) {
      const q = new URLSearchParams({ page: String(page), perPage: '200', filter });
      const list = await pbFetch<{ items: { id: string }[] }>(`/api/collections/${collection}/records?${q.toString()}`);
      const items = list.items ?? [];
      if (!items.length) break;
      for (const item of items) {
        await pbFetch(`/api/collections/${collection}/records/${item.id}`, { method: 'DELETE' });
      }
      if (items.length < 200) break;
      page += 1;
    }
  }

  await deleteRelated('messages', `taskId = "${id}"`);
  await deleteRelated('documents', `taskId = "${id}"`);
  await deleteRelated('activities', `taskId = "${id}"`);
  await deleteRelated('notifications', `taskId = "${id}"`);
  await deleteRelated('task_subscriptions', `taskId = "${id}"`);
  await deleteRelated('subtasks', `taskId = "${id}"`);
  await deleteRelated('task_files', `taskId = "${id}"`);

  await pbFetch(`/api/collections/tasks/records/${id}`, { method: 'DELETE' });

  return NextResponse.json({ ok: true });
}
