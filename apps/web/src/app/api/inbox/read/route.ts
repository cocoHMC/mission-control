import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const read = Boolean(body?.read ?? true);
  let ids = Array.isArray(body?.ids) ? body.ids.map((id: unknown) => String(id || '').trim()).filter(Boolean) : [];

  if (!ids.length && body?.all) {
    const unreadOnly = Boolean(body?.unreadOnly ?? true);
    const filterParts: string[] = [];
    if (unreadOnly) filterParts.push('readAt = ""');
    const agentId = String(body?.agentId || '').trim();
    if (agentId) filterParts.push(`toAgentId = "${pbFilterString(agentId)}"`);
    const taskId = String(body?.taskId || '').trim();
    if (taskId) filterParts.push(`taskId = "${pbFilterString(taskId)}"`);

    const q = new URLSearchParams({
      page: '1',
      perPage: '200',
      ...(filterParts.length ? { filter: filterParts.join(' && ') } : {}),
    });
    const list = await pbFetch<{ items?: Array<{ id: string }> }>(`/api/collections/notifications/records?${q.toString()}`);
    ids = (list.items || []).map((it) => String(it.id || '').trim()).filter(Boolean);
  }

  if (!ids.length) return NextResponse.json({ ok: true, updated: 0 });

  const readAt = read ? new Date().toISOString() : '';
  await Promise.all(
    ids.map(async (id: string) => {
      try {
        await pbFetch(`/api/collections/notifications/records/${id}`, {
          method: 'PATCH',
          body: { readAt },
        });
      } catch (err: any) {
        const msg = String(err?.message || '');
        if (msg.includes('readAt')) return;
        throw err;
      }
    })
  );

  return NextResponse.json({ ok: true, updated: ids.length });
}
