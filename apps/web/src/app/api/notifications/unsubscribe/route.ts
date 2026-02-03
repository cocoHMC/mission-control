import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { requireAdminAuth } from '@/lib/adminAuth';

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const endpoint = String(body?.endpoint || '').trim();

  if (!endpoint) {
    return NextResponse.json({ ok: false, error: 'endpoint required' }, { status: 400 });
  }

  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `endpoint = "${endpoint}"`,
  });
  const existing = await pbFetch<{ items: { id: string }[] }>(`/api/collections/push_subscriptions/records?${q.toString()}`);

  if (existing.items?.length) {
    await pbFetch(`/api/collections/push_subscriptions/records/${existing.items[0].id}`, {
      method: 'PATCH',
      body: { enabled: false, lastSeenAt: new Date().toISOString() },
    });
  }

  return NextResponse.json({ ok: true });
}
