import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeLabels(value: unknown) {
  if (Array.isArray(value)) return value.map((v) => safeString(v)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
  }
  return [] as string[];
}

function normalizeAssigneeIds(value: unknown) {
  if (!Array.isArray(value)) return [] as string[];
  return value
    .map((v) => safeString(v))
    .filter(Boolean);
}

function normalizePriority(value: unknown) {
  const p = safeString(value).toLowerCase();
  if (p === 'p0' || p === 'p1' || p === 'p2' || p === 'p3') return p;
  return '';
}

function normalizeDate(value: unknown) {
  const v = safeString(value);
  if (!v) return '';
  const ms = Date.parse(v);
  if (!Number.isFinite(ms)) return '';
  return new Date(ms).toISOString();
}

export async function POST(req: NextRequest) {
  const configuredKey = safeString(process.env.MC_INTAKE_WEBHOOK_KEY);
  if (!configuredKey) {
    return NextResponse.json({ ok: false, error: 'Webhook intake is disabled.' }, { status: 503 });
  }

  const providedKey = safeString(req.headers.get('x-mc-intake-key')) || safeString(new URL(req.url).searchParams.get('key'));
  if (!providedKey || providedKey !== configuredKey) {
    return NextResponse.json({ ok: false, error: 'Unauthorized intake key.' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const title =
    safeString(body?.title) ||
    safeString(body?.subject) ||
    safeString(body?.summary) ||
    safeString(body?.text).slice(0, 120) ||
    safeString(body?.message).slice(0, 120);
  if (!title) return NextResponse.json({ ok: false, error: 'title (or subject/summary/text) is required' }, { status: 400 });

  const projectId = safeString(body?.projectId);
  const priority = normalizePriority(body?.priority);
  const labels = normalizeLabels(body?.labels);
  const assigneeIds = normalizeAssigneeIds(body?.assigneeIds);
  const contextSource = safeString(body?.source);
  const externalId = safeString(body?.externalId);
  const contextHint = [contextSource ? `source=${contextSource}` : '', externalId ? `externalId=${externalId}` : '']
    .filter(Boolean)
    .join(' ');
  const context = [contextHint, safeString(body?.context)].filter(Boolean).join('\n').trim();

  const taskPayload: Record<string, unknown> = {
    projectId,
    title,
    description: safeString(body?.description) || safeString(body?.text) || safeString(body?.message),
    context,
    status: 'inbox',
    priority,
    labels,
    assigneeIds,
    startAt: normalizeDate(body?.startAt),
    dueAt: normalizeDate(body?.dueAt),
    createdAt: now,
    updatedAt: now,
  };

  const createdTask = await pbFetch<any>('/api/collections/tasks/records', {
    method: 'POST',
    body: taskPayload,
  });

  const taskId = safeString(createdTask?.id);
  if (taskId) {
    await pbFetch('/api/collections/activities/records', {
      method: 'POST',
      body: {
        type: 'intake_webhook',
        summary: `Webhook intake created task "${title}".`,
        taskId,
        actorAgentId: '',
        createdAt: now,
      },
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, taskId, task: createdTask }, { status: 201 });
}
