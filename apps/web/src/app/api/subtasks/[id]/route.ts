import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();

  const payload = { ...body, updatedAt: new Date().toISOString() };
  const updated = await pbFetch(`/api/collections/subtasks/records/${id}`, { method: 'PATCH', body: payload });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pbFetch(`/api/collections/subtasks/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}

