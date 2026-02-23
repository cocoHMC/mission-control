import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/workflow_schedules/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  if (Object.prototype.hasOwnProperty.call(body, 'workflowId')) {
    const workflowId = safeString((body as any)?.workflowId);
    if (!workflowId) return NextResponse.json({ ok: false, error: 'workflowId required' }, { status: 400 });
    const workflow = await pbFetch<any>(`/api/collections/workflows/records/${workflowId}`).catch(() => null);
    const workflowKind = safeString(workflow?.kind) || 'manual';
    if (workflowKind !== 'lobster') {
      return NextResponse.json(
        { ok: false, error: `Scheduled runs require a lobster workflow (got "${workflowKind}").` },
        { status: 400 }
      );
    }
  }
  const payload = { ...body, updatedAt: new Date().toISOString() };
  const updated = await pbFetch(`/api/collections/workflow_schedules/records/${id}`, { method: 'PATCH', body: payload });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pbFetch(`/api/collections/workflow_schedules/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}
