import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/tasks/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const { blockReason, blockActorId } = body ?? {};
  const payload = { ...body };
  delete payload.blockReason;
  delete payload.blockActorId;
  if (payload.status && payload.status !== 'done') {
    payload.lastProgressAt = new Date().toISOString();
  }
  const updated = await pbFetch(`/api/collections/tasks/records/${id}`, { method: 'PATCH', body: payload });

  if (payload.status === 'blocked' && blockReason) {
    await pbFetch('/api/collections/messages/records', {
      method: 'POST',
      body: {
        taskId: id,
        fromAgentId: blockActorId ?? '',
        content: `BLOCKED: ${blockReason}`,
        mentions: [],
      },
    });
  }

  return NextResponse.json(updated);
}
