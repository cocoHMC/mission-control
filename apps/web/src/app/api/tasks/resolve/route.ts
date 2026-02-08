import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import type { PBList, Task } from '@/lib/types';

function pbFilterString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function POST(req: NextRequest) {
  let body: any = null;
  try {
    body = await req.json();
  } catch {
    body = null;
  }

  const idsRaw = Array.isArray(body?.ids) ? body.ids : [];
  const ids: string[] = idsRaw
    .map((v: unknown) => String(v ?? '').trim())
    .filter((v: string): v is string => Boolean(v))
    .slice(0, 200);

  if (!ids.length) return NextResponse.json({ ok: true, byId: {} });

  const filter = ids.map((id) => `id = "${pbFilterString(id)}"`).join(' || ');
  const q = new URLSearchParams({ page: '1', perPage: String(Math.min(200, ids.length)), filter });
  const data = await pbFetch<PBList<Task>>(`/api/collections/tasks/records?${q.toString()}`);

  const byId: Record<string, { id: string; title: string; status?: string; archived?: boolean }> = {};
  for (const t of data.items ?? []) {
    if (!t?.id) continue;
    byId[t.id] = { id: t.id, title: String(t.title || t.id), status: t.status, archived: Boolean(t.archived) };
  }

  return NextResponse.json({ ok: true, byId });
}
