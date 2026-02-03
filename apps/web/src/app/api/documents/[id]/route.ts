import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const updated = await pbFetch(`/api/collections/documents/records/${id}`, {
    method: 'PATCH',
    body: { ...body, updatedAt: new Date().toISOString() },
  });
  return NextResponse.json(updated);
}
