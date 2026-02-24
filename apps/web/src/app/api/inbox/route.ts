import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function toInt(value: string | null, fallback: number) {
  const n = Number.parseInt(String(value || ''), 10);
  return Number.isFinite(n) ? n : fallback;
}

const NOTIFICATION_SORT_FALLBACKS = ['-created', '-createdAt', '-deliveredAt,-id', '-id'];

function isPbBadRequest(err: any) {
  return Number((err as any)?.status || 0) === 400;
}

async function listNotifications(baseQ: URLSearchParams) {
  let lastErr: unknown = null;
  for (const sort of NOTIFICATION_SORT_FALLBACKS) {
    const q = new URLSearchParams(baseQ);
    q.set('sort', sort);
    try {
      return await pbFetch(`/api/collections/notifications/records?${q.toString()}`);
    } catch (err: any) {
      lastErr = err;
      if (!isPbBadRequest(err)) throw err;
    }
  }
  if (lastErr) throw lastErr;
  return pbFetch(`/api/collections/notifications/records?${baseQ.toString()}`);
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
    ...(filters.length ? { filter: filters.join(' && ') } : {}),
  });
  try {
    const data = await listNotifications(q);
    return NextResponse.json(data);
  } catch (err: any) {
    if (unreadOnly) {
      const retryFilters = filters.filter((f) => f !== 'readAt = ""');
      const retryQ = new URLSearchParams({
        page: String(page),
        perPage: String(perPage),
        ...(retryFilters.length ? { filter: retryFilters.join(' && ') } : {}),
      });
      try {
        const data = await listNotifications(retryQ);
        return NextResponse.json(data);
      } catch {
        // Preserve the original error below for better diagnostics.
      }
    }
    throw err;
  }
}
