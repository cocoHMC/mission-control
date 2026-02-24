import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { fallbackRecurrenceDate, normalizeTaskRecurrence } from '@/lib/taskRecurrence';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/tasks/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const leadAgentId = process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'coco';
  const now = new Date().toISOString();
  const startAt = body.startAt ?? '';
  const dueAt = body.dueAt ?? '';
  let recurrence = null;
  try {
    recurrence = normalizeTaskRecurrence(body.recurrence, { fallbackDate: fallbackRecurrenceDate(dueAt, startAt, now) });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message || 'Invalid recurrence.' }, { status: 400 });
  }

  const recurrenceSeriesId = recurrence ? safeString(body.recurrenceSeriesId) : '';
  const recurrenceFromTaskId = recurrence ? safeString(body.recurrenceFromTaskId) : '';
  const recurrenceSpawnedTaskId = recurrence ? safeString(body.recurrenceSpawnedTaskId) : '';

  const payload = {
    projectId: String(body.projectId || '').trim(),
    title: body.title,
    description: body.description ?? '',
    context: body.context ?? '',
    vaultItem: body.vaultItem ?? '',
    status: body.status ?? 'inbox',
    priority: body.priority ?? 'p2',
    aiEffort: body.aiEffort ?? 'auto',
    aiThinking: body.aiThinking ?? 'auto',
    aiModelTier: body.aiModelTier ?? 'auto',
    aiModel: body.aiModel ?? '',
    assigneeIds: body.assigneeIds ?? [],
    labels: body.labels ?? [],
    requiredNodeId: body.requiredNodeId ?? '',
    escalationAgentId: body.escalationAgentId ?? leadAgentId,
    maxAutoNudges: body.maxAutoNudges ?? 3,
    attemptCount: body.attemptCount ?? 0,
    archived: Boolean(body.archived ?? false),
    createdAt: body.createdAt ?? now,
    updatedAt: now,
    startAt,
    dueAt,
    completedAt: '',
    recurrence,
    recurrenceSeriesId,
    recurrenceFromTaskId,
    recurrenceSpawnedTaskId,
    requiresReview: Boolean(body.requiresReview ?? false),
    policy: body.policy ?? null,
    reviewChecklist: body.reviewChecklist ?? null,
    order: typeof body.order === 'number' ? body.order : Date.now(),
    subtasksTotal: 0,
    subtasksDone: 0,
  };
  const created = await pbFetch<any>('/api/collections/tasks/records', { method: 'POST', body: payload });

  if (recurrence && !recurrenceSeriesId && !recurrenceFromTaskId && typeof created?.id === 'string' && created.id) {
    try {
      const patched = await pbFetch(`/api/collections/tasks/records/${created.id}`, {
        method: 'PATCH',
        body: { recurrenceSeriesId: created.id, updatedAt: now },
      });
      return NextResponse.json(patched);
    } catch {
      // If the follow-up patch fails, return the created record so task creation still succeeds.
    }
  }

  return NextResponse.json(created);
}
