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
  const event = safeString(value);
  if (!event) return '';
  if (['task_status_to', 'task_created', 'task_due_soon'].includes(event)) return event;
  return '';
}

function normalizeStatus(value: unknown) {
  const status = safeString(value);
  if (!status) return '';
  if (['inbox', 'assigned', 'in_progress', 'review', 'done', 'blocked'].includes(status)) return status;
  return '';
}

function normalizePriority(value: unknown) {
  const priority = safeString(value).toLowerCase();
  if (!priority) return '';
  if (['p0', 'p1', 'p2', 'p3'].includes(priority)) return priority;
  return '';
}

function normalizeDueWithinMinutes(value: unknown) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/workflow_triggers/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payload: Record<string, unknown> = { ...body, updatedAt: new Date().toISOString() };
  if ('workflowId' in payload) {
    const workflowId = safeString(payload.workflowId);
    if (!workflowId) return NextResponse.json({ ok: false, error: 'workflowId required' }, { status: 400 });
    const workflow = await pbFetch<any>(`/api/collections/workflows/records/${workflowId}`).catch(() => null);
    const workflowKind = safeString(workflow?.kind) || 'manual';
    if (workflowKind !== 'lobster') {
      return NextResponse.json(
        { ok: false, error: `Workflow triggers require a lobster workflow (got "${workflowKind}").` },
        { status: 400 }
      );
    }
  }
  if ('event' in payload) payload.event = normalizeEvent(payload.event);
  if ('statusTo' in payload) payload.statusTo = normalizeStatus(payload.statusTo);
  if ('priority' in payload) payload.priority = normalizePriority(payload.priority);
  if ('projectId' in payload) payload.projectId = safeString(payload.projectId);
  if ('assigneeId' in payload) payload.assigneeId = safeString(payload.assigneeId);
  if ('labelsAny' in payload) payload.labelsAny = normalizeStringArray(payload.labelsAny);
  if ('dueWithinMinutes' in payload) payload.dueWithinMinutes = normalizeDueWithinMinutes(payload.dueWithinMinutes);
  if ('actions' in payload) payload.actions = payload.actions && typeof payload.actions === 'object' ? payload.actions : null;
  if ('sessionKey' in payload) payload.sessionKey = safeString(payload.sessionKey);
  if ('workflowId' in payload) payload.workflowId = safeString(payload.workflowId);
  const updated = await pbFetch(`/api/collections/workflow_triggers/records/${id}`, { method: 'PATCH', body: payload });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pbFetch(`/api/collections/workflow_triggers/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}
