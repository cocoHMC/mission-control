import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { ensureTaskSubscription } from '@/lib/subscriptions';
import { fallbackRecurrenceDate, normalizeTaskRecurrence } from '@/lib/taskRecurrence';

type ReviewChecklistItem = { id: string; label: string; done: boolean };
type ReviewChecklist = { version: 1; items: ReviewChecklistItem[] };

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function defaultReviewChecklist(): ReviewChecklist {
  return {
    version: 1,
    items: [
      { id: 'deliverable', label: 'Deliverable attached (doc/link/file)', done: false },
      { id: 'tests', label: 'Tests or smoke checks passed', done: false },
      { id: 'deploy', label: 'Deploy / runtime verified (if applicable)', done: false },
    ],
  };
}

function checklistItemsFromRaw(raw: unknown): ReviewChecklistItem[] {
  if (!raw) return [];
  const obj = raw as any;
  const items = Array.isArray(obj?.items) ? obj.items : Array.isArray(raw) ? raw : [];
  if (!Array.isArray(items)) return [];
  return items
    .map((it: any) => {
      const id = typeof it?.id === 'string' ? it.id.trim() : '';
      const label = typeof it?.label === 'string' ? it.label.trim() : typeof it?.title === 'string' ? it.title.trim() : '';
      const done = Boolean(it?.done);
      if (!label) return null;
      return { id: id || label.slice(0, 32), label, done };
    })
    .filter(Boolean) as ReviewChecklistItem[];
}

async function unresolvedDependencies(taskId: string) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '200',
    filter: `blockedTaskId = "${pbFilterString(taskId)}"`,
  });

  let deps: any[] = [];
  try {
    const list = await pbFetch<{ items?: any[] }>(`/api/collections/task_dependencies/records?${q.toString()}`);
    deps = Array.isArray(list?.items) ? list.items : [];
  } catch {
    // Optional collection (older schema): no dependencies to enforce.
    return [];
  }

  const dependsIds = Array.from(
    new Set(deps.map((d) => String(d?.dependsOnTaskId || '').trim()).filter(Boolean))
  );
  if (!dependsIds.length) return [];

  const rows = await Promise.all(
    dependsIds.map(async (dependsOnTaskId) => {
      try {
        const task = await pbFetch<any>(`/api/collections/tasks/records/${dependsOnTaskId}`);
        return {
          taskId: dependsOnTaskId,
          title: String(task?.title || dependsOnTaskId),
          status: String(task?.status || 'unknown'),
        };
      } catch {
        return { taskId: dependsOnTaskId, title: dependsOnTaskId, status: 'missing' };
      }
    })
  );

  return rows.filter((row) => row.status !== 'done');
}

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

  if (Object.prototype.hasOwnProperty.call(body ?? {}, 'recurrence')) {
    try {
      const parsed = normalizeTaskRecurrence(body?.recurrence, {
        fallbackDate: fallbackRecurrenceDate(body?.dueAt, body?.startAt, payload.updatedAt),
      });
      payload.recurrence = parsed;
      if (parsed) {
        if (Object.prototype.hasOwnProperty.call(body ?? {}, 'recurrenceSeriesId')) {
          payload.recurrenceSeriesId = safeString(body?.recurrenceSeriesId);
        }
        if (Object.prototype.hasOwnProperty.call(body ?? {}, 'recurrenceFromTaskId')) {
          payload.recurrenceFromTaskId = safeString(body?.recurrenceFromTaskId);
        }
        if (Object.prototype.hasOwnProperty.call(body ?? {}, 'recurrenceSpawnedTaskId')) {
          payload.recurrenceSpawnedTaskId = safeString(body?.recurrenceSpawnedTaskId);
        } else {
          // Editing recurrence should reset spawn linkage unless caller explicitly preserves it.
          payload.recurrenceSpawnedTaskId = '';
        }
      } else {
        payload.recurrenceSeriesId = '';
        payload.recurrenceFromTaskId = '';
        payload.recurrenceSpawnedTaskId = '';
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return NextResponse.json({ ok: false, error: message || 'Invalid recurrence.' }, { status: 400 });
    }
  }

  // Review gate: if requiresReview=true, block moving to done until checklist is complete.
  if (payload.status === 'in_progress') {
    const unresolved = await unresolvedDependencies(id);
    if (unresolved.length) {
      return NextResponse.json(
        {
          ok: false,
          error: `Task has unresolved dependencies (${unresolved.length}).`,
          unresolved,
        },
        { status: 409 }
      );
    }
  }

  // Review gate: if requiresReview=true, block moving to done until checklist is complete.
  if (payload.status === 'done') {
    const current = await pbFetch<any>(`/api/collections/tasks/records/${id}`);
    const requiresReview = payload.requiresReview ?? current?.requiresReview;
    if (requiresReview) {
      const items = checklistItemsFromRaw(payload.reviewChecklist ?? current?.reviewChecklist);
      if (!items.length) {
        return NextResponse.json(
          {
            ok: false,
            error: 'Review checklist required before marking done.',
            suggestedChecklist: defaultReviewChecklist(),
          },
          { status: 409 }
        );
      }
      const incomplete = items.filter((it) => !it.done);
      if (incomplete.length) {
        return NextResponse.json(
          {
            ok: false,
            error: `Review checklist incomplete (${incomplete.length} remaining).`,
            incomplete: incomplete.map((it) => ({ id: it.id, label: it.label })),
          },
          { status: 409 }
        );
      }
    }
  }

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
  await deleteRelated('task_dependencies', `blockedTaskId = "${id}"`).catch(() => {});
  await deleteRelated('task_dependencies', `dependsOnTaskId = "${id}"`).catch(() => {});

  await pbFetch(`/api/collections/tasks/records/${id}`, { method: 'DELETE' });

  return NextResponse.json({ ok: true });
}
