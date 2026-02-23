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

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.toString();
  const data = await pbFetch(`/api/collections/task_views/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: 'View name is required.' }, { status: 400 });
  }

  const now = new Date().toISOString();
  const payload = {
    name,
    description: String(body?.description || '').trim(),
    filters: normalizeFilters(body?.filters),
    createdAt: now,
    updatedAt: now,
  };
  const created = await pbFetch('/api/collections/task_views/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}

