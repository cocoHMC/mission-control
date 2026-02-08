import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

function base64Url(bytes: Buffer) {
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeShareToken() {
  return base64Url(crypto.randomBytes(24));
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/task_files/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  const rotate = Boolean((body as any)?.rotateShareToken);
  const payload: Record<string, unknown> = { ...body };
  delete (payload as any).rotateShareToken;

  if (rotate) payload.shareToken = makeShareToken();
  payload.updatedAt = new Date().toISOString();

  const updated = await pbFetch(`/api/collections/task_files/records/${id}`, { method: 'PATCH', body: payload });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pbFetch(`/api/collections/task_files/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}

