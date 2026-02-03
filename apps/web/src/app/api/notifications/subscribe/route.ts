import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { requireAdminAuth } from '@/lib/adminAuth';

type PushSubscription = {
  endpoint: string;
  keys?: { p256dh?: string; auth?: string };
};

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const body = await req.json().catch(() => ({}));
  const subscription = body?.subscription as PushSubscription | undefined;
  const deviceLabel = String(body?.deviceLabel || '').trim();
  const endpoint = subscription?.endpoint;
  const p256dh = subscription?.keys?.p256dh;
  const auth = subscription?.keys?.auth;

  if (!endpoint || !p256dh || !auth) {
    return NextResponse.json({ ok: false, error: 'Invalid subscription payload' }, { status: 400 });
  }

  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `endpoint = "${endpoint}"`,
  });
  const existing = await pbFetch<{ items: { id: string }[] }>(`/api/collections/push_subscriptions/records?${q.toString()}`);

  const payload = {
    endpoint,
    p256dh,
    auth,
    deviceLabel,
    userAgent: req.headers.get('user-agent') || '',
    enabled: true,
    lastSeenAt: new Date().toISOString(),
  };

  if (existing.items?.length) {
    await pbFetch(`/api/collections/push_subscriptions/records/${existing.items[0].id}`, {
      method: 'PATCH',
      body: payload,
    });
  } else {
    await pbFetch('/api/collections/push_subscriptions/records', { method: 'POST', body: payload });
  }

  return NextResponse.json({ ok: true });
}
