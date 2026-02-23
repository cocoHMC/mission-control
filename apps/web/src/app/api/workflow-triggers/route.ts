import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((v) => safeString(v)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

function normalizeEvent(value: unknown) {
  const event = safeString(value) || 'task_status_to';
  if (['task_status_to', 'task_created', 'task_due_soon'].includes(event)) return event;
  return '';
}

function normalizeStatus(value: unknown) {
  const status = safeString(value);
  if (['inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'].includes(status)) return status;
  return '';
}

function normalizePriority(value: unknown) {
  const priority = safeString(value).toLowerCase();
  if (['p0', 'p1', 'p2', 'p3'].includes(priority)) return priority;
  return '';
}

function normalizeDueWithinMinutes(value: unknown) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/workflow_triggers/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const workflowId = safeString(body.workflowId);
  if (!workflowId) return NextResponse.json({ ok: false, error: 'workflowId required' }, { status: 400 });
  const workflow = await pbFetch<any>(`/api/collections/workflows/records/${workflowId}`).catch(() => null);
  const workflowKind = safeString(workflow?.kind) || 'manual';
  if (workflowKind !== 'lobster') {
    return NextResponse.json(
      { ok: false, error: `Workflow triggers require a lobster workflow (got "${workflowKind}").` },
      { status: 400 }
    );
  }

  const event = normalizeEvent(body.event);
  if (!event) return NextResponse.json({ ok: false, error: 'Unsupported event' }, { status: 400 });
  const statusTo = normalizeStatus(body.statusTo);
  if (event === 'task_status_to' && !statusTo) {
    return NextResponse.json({ ok: false, error: 'statusTo required for task_status_to events' }, { status: 400 });
  }
  const dueWithinMinutes = normalizeDueWithinMinutes(body.dueWithinMinutes);
  if (event === 'task_due_soon' && !dueWithinMinutes) {
    return NextResponse.json({ ok: false, error: 'dueWithinMinutes required for task_due_soon events' }, { status: 400 });
  }

  const payload = {
    workflowId,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
    event,
    statusTo,
    labelsAny: normalizeStringArray(body.labelsAny),
    projectId: safeString(body.projectId),
    priority: normalizePriority(body.priority),
    assigneeId: safeString(body.assigneeId),
    dueWithinMinutes,
    actions: body.actions && typeof body.actions === 'object' ? body.actions : null,
    sessionKey: safeString(body.sessionKey),
    vars: body.vars && typeof body.vars === 'object' ? body.vars : null,
    createdAt: now,
    updatedAt: now,
  };

  const created = await pbFetch('/api/collections/workflow_triggers/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}
