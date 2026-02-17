import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/workflow_runs/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payload = { ...body, updatedAt: new Date().toISOString() };
  const updated = await pbFetch(`/api/collections/workflow_runs/records/${id}`, { method: 'PATCH', body: payload });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pbFetch(`/api/collections/workflow_runs/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}

