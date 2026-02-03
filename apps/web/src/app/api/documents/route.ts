import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export async function POST(req: NextRequest) {
  const body = await req.json();
  const now = new Date().toISOString();
  const payload = {
    taskId: body.taskId ?? '',
    title: body.title,
    content: body.content ?? '',
    type: body.type ?? 'deliverable',
    createdAt: now,
    updatedAt: now,
  };
  const created = await pbFetch('/api/collections/documents/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}

export async function GET(req: NextRequest) {
  const search = new URL(req.url).searchParams.toString();
  const data = await pbFetch(`/api/collections/documents/records${search ? `?${search}` : ''}`);
  return NextResponse.json(data);
}
