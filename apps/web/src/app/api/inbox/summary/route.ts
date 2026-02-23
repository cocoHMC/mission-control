import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function toBool(value: string) {
  return ['1', 'true', 'yes', 'y', 'on'].includes(String(value || '').trim().toLowerCase());
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const onlyDelivered = toBool(url.searchParams.get('deliveredOnly') || '0');
  const agentId = String(url.searchParams.get('agentId') || '').trim();

  const unreadFilters: string[] = ['readAt = ""'];
  if (onlyDelivered) unreadFilters.push('delivered = true');
  if (agentId) unreadFilters.push(`toAgentId = "${agentId.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`);
  const unreadQ = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: unreadFilters.join(' && '),
  });

  const pendingQ = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: 'delivered = false',
  });

  const pendingPromise = pbFetch<{ totalItems?: number }>(`/api/collections/notifications/records?${pendingQ.toString()}`);
  const unreadPromise = pbFetch<{ totalItems?: number }>(`/api/collections/notifications/records?${unreadQ.toString()}`).catch((err: any) => {
    const msg = String(err?.message || '');
    if (msg.includes('readAt')) return { totalItems: 0 };
    throw err;
  });
  const [unread, pending] = await Promise.all([unreadPromise, pendingPromise]);

  return NextResponse.json({
    ok: true,
    unread: Number(unread?.totalItems || 0),
    pending: Number(pending?.totalItems || 0),
  });
}
