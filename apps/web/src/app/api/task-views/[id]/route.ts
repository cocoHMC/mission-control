import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function normalizeFilters(input: unknown) {
  const row = input && typeof input === 'object' ? (input as Record<string, unknown>) : {};
  return {
    projectId: String(row.projectId || '').trim(),
    status: String(row.status || '').trim(),
    assignee: String(row.assignee || '').trim(),
    priority: String(row.priority || '').trim(),
    q: String(row.q || '').trim(),
    sort: String(row.sort || '').trim(),
  };
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/task_views/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payload: Record<string, unknown> = {
    ...body,
    updatedAt: new Date().toISOString(),
  };
  if ('name' in payload) payload.name = String(payload.name || '').trim();
  if ('description' in payload) payload.description = String(payload.description || '').trim();
  if ('filters' in payload) payload.filters = normalizeFilters(payload.filters);
  const updated = await pbFetch(`/api/collections/task_views/records/${id}`, { method: 'PATCH', body: payload });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pbFetch(`/api/collections/task_views/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}

