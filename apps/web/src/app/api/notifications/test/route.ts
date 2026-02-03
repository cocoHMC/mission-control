import { NextRequest, NextResponse } from 'next/server';
import webpush from 'web-push';
import { pbFetch } from '@/lib/pbServer';
import { requireAdminAuth } from '@/lib/adminAuth';

type SubRecord = {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  enabled?: boolean;
};

async function listSubscriptions() {
  const q = new URLSearchParams({
    page: '1',
    perPage: '200',
    filter: 'enabled = true',
  });
  const data = await pbFetch<{ items: SubRecord[] }>(`/api/collections/push_subscriptions/records?${q.toString()}`);
  return data.items ?? [];
}

export async function POST(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const publicKey = process.env.WEB_PUSH_PUBLIC_KEY || '';
  const privateKey = process.env.WEB_PUSH_PRIVATE_KEY || '';
  const subject = process.env.WEB_PUSH_SUBJECT || 'mailto:admin@local';

  if (!publicKey || !privateKey) {
    return NextResponse.json({ ok: false, error: 'WEB_PUSH_* keys missing' }, { status: 400 });
  }

  webpush.setVapidDetails(subject, publicKey, privateKey);

  const subs = await listSubscriptions();
  if (!subs.length) {
    return NextResponse.json({ ok: false, error: 'No subscriptions found' }, { status: 400 });
  }

  const payload = JSON.stringify({
    title: 'Mission Control',
    body: 'Test notification received.',
    url: '/tasks',
  });

  const results = await Promise.allSettled(
    subs.map((sub) =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload
      )
    )
  );

  const failed = results.filter((r) => r.status === 'rejected');
  return NextResponse.json({ ok: true, sent: results.length, failed: failed.length });
}
