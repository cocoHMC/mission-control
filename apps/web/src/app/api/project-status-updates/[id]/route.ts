import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStatus(value: unknown) {
  const status = safeString(value).toLowerCase();
  if (status === 'on_track' || status === 'at_risk' || status === 'off_track') return status;
  return '';
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/project_status_updates/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payload: Record<string, unknown> = { ...body, updatedAt: new Date().toISOString() };
  if ('projectId' in payload) payload.projectId = safeString(payload.projectId);
  if ('summary' in payload) payload.summary = safeString(payload.summary);
  if ('highlights' in payload) payload.highlights = safeString(payload.highlights);
  if ('risks' in payload) payload.risks = safeString(payload.risks);
  if ('nextSteps' in payload) payload.nextSteps = safeString(payload.nextSteps);
  if ('status' in payload) payload.status = normalizeStatus(payload.status);
  const updated = await pbFetch(`/api/collections/project_status_updates/records/${id}`, {
    method: 'PATCH',
    body: payload,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pbFetch(`/api/collections/project_status_updates/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}
