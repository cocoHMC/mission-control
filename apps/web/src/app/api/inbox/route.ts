import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function toInt(value: string | null, fallback: number) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, toInt(url.searchParams.get('page'), 1));
  const perPage = Math.min(200, Math.max(1, toInt(url.searchParams.get('perPage'), 100)));
  const unreadOnly = ['1', 'true', 'yes'].includes(String(url.searchParams.get('unread') || '').toLowerCase());
  const deliveredOnly = ['1', 'true', 'yes'].includes(String(url.searchParams.get('delivered') || '').toLowerCase());
  const agentId = String(url.searchParams.get('agentId') || '').trim();
  const taskId = String(url.searchParams.get('taskId') || '').trim();

  const filters: string[] = [];
  if (unreadOnly) filters.push('readAt = ""');
  if (deliveredOnly) filters.push('delivered = true');
  if (agentId) filters.push(`toAgentId = "${pbFilterString(agentId)}"`);
  if (taskId) filters.push(`taskId = "${pbFilterString(taskId)}"`);

  const q = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sort: '-created',
    ...(filters.length ? { filter: filters.join(' && ') } : {}),
  });
  try {
    const data = await pbFetch(`/api/collections/notifications/records?${q.toString()}`);
    return NextResponse.json(data);
  } catch (err: any) {
    const msg = String(err?.message || '');
    if (unreadOnly && msg.includes('readAt')) {
      const retryQ = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
        sort: '-created',
      });
      const data = await pbFetch(`/api/collections/notifications/records?${retryQ.toString()}`);
      return NextResponse.json(data);
    }
    throw err;
  }
}
