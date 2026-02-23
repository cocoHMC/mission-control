import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import type { Task } from '@/lib/types';

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

async function fetchTask(taskId: string): Promise<Task | null> {
  if (!taskId) return null;
  try {
    return await pbFetch<Task>(`/api/collections/tasks/records/${taskId}`);
  } catch {
    return null;
  }
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const includeDetails = ['1', 'true', 'yes'].includes(String(url.searchParams.get('includeDetails') || '').toLowerCase());
  const blockedTaskId = String(url.searchParams.get('blockedTaskId') || '').trim();
  const dependsOnTaskId = String(url.searchParams.get('dependsOnTaskId') || '').trim();

  const page = Math.max(1, Number.parseInt(String(url.searchParams.get('page') || '1'), 10) || 1);
  const perPage = Math.min(200, Math.max(1, Number.parseInt(String(url.searchParams.get('perPage') || '200'), 10) || 200));
  const filters: string[] = [];
  if (blockedTaskId) filters.push(`blockedTaskId = "${pbFilterString(blockedTaskId)}"`);
  if (dependsOnTaskId) filters.push(`dependsOnTaskId = "${pbFilterString(dependsOnTaskId)}"`);

  const q = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sort: '-createdAt',
    ...(filters.length ? { filter: filters.join(' && ') } : {}),
  });
  const data = await pbFetch<any>(`/api/collections/task_dependencies/records?${q.toString()}`);
  if (!includeDetails) return NextResponse.json(data);

  const items = Array.isArray(data?.items) ? data.items : [];
  const taskIds = new Set<string>();
  for (const item of items) {
    const blocked = String(item?.blockedTaskId || '').trim();
    const depends = String(item?.dependsOnTaskId || '').trim();
    if (blocked) taskIds.add(blocked);
    if (depends) taskIds.add(depends);
  }

  const taskMap = new Map<string, Task | null>();
  await Promise.all(
    Array.from(taskIds).map(async (taskId) => {
      taskMap.set(taskId, await fetchTask(taskId));
    })
  );

  return NextResponse.json({
    ...data,
    items: items.map((item: any) => ({
      ...item,
      blockedTask: taskMap.get(String(item?.blockedTaskId || '').trim()) || null,
      dependsOnTask: taskMap.get(String(item?.dependsOnTaskId || '').trim()) || null,
    })),
  });
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const blockedTaskId = String(body?.blockedTaskId || '').trim();
  const dependsOnTaskId = String(body?.dependsOnTaskId || '').trim();
  const reason = String(body?.reason || '').trim();

  if (!blockedTaskId || !dependsOnTaskId) {
    return NextResponse.json({ ok: false, error: 'blockedTaskId and dependsOnTaskId are required.' }, { status: 400 });
  }
  if (blockedTaskId === dependsOnTaskId) {
    return NextResponse.json({ ok: false, error: 'A task cannot depend on itself.' }, { status: 400 });
  }

  const existingQ = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `blockedTaskId = "${pbFilterString(blockedTaskId)}" && dependsOnTaskId = "${pbFilterString(dependsOnTaskId)}"`,
  });
  const existing = await pbFetch<any>(`/api/collections/task_dependencies/records?${existingQ.toString()}`);
  if (Array.isArray(existing?.items) && existing.items.length) {
    return NextResponse.json(existing.items[0]);
  }

  const now = new Date().toISOString();
  const created = await pbFetch('/api/collections/task_dependencies/records', {
    method: 'POST',
    body: {
      blockedTaskId,
      dependsOnTaskId,
      reason,
      kind: 'blocks',
      createdAt: now,
      updatedAt: now,
    },
  });

  return NextResponse.json(created);
}

