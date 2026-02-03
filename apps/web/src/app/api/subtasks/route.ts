import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/subtasks/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const taskId = String(body.taskId ?? '').trim();
  const title = String(body.title ?? '').trim();

  if (!taskId) return new NextResponse('taskId required', { status: 400 });
  if (!title) return new NextResponse('title required', { status: 400 });

  const now = new Date().toISOString();
  const payload = {
    taskId,
    title,
    done: Boolean(body.done ?? false),
    order: typeof body.order === 'number' ? body.order : Date.now(),
    assigneeIds: body.assigneeIds ?? [],
    dueAt: body.dueAt ?? '',
    createdAt: now,
    updatedAt: now,
  };

  const created = await pbFetch('/api/collections/subtasks/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}

