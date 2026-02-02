import { pbFetch } from '@/lib/pbServer';

type SubscriptionReason = 'assigned' | 'commented' | 'mentioned' | 'manual';

export async function ensureTaskSubscription(opts: {
  taskId: string;
  agentId: string;
  reason: SubscriptionReason;
}) {
  const { taskId, agentId, reason } = opts;
  if (!taskId || !agentId) return null;

  // PocketBase doesn't enforce uniqueness here, so we do a cheap existence check.
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `taskId = "${taskId}" && agentId = "${agentId}"`,
  });
  const existing = await pbFetch(`/api/collections/task_subscriptions/records?${q.toString()}`);
  if (existing?.items?.length) return existing.items[0];

  try {
    return await pbFetch('/api/collections/task_subscriptions/records', {
      method: 'POST',
      body: { taskId, agentId, reason },
    });
  } catch {
    // Best-effort: concurrent creates or rule failures shouldn't break task/message creation.
    return null;
  }
}
