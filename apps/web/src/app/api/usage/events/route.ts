import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function pbFilterString(value: string) {
  return String(value || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function pbDateForFilter(date: Date) {
  return date.toISOString().replace('T', ' ');
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const page = Math.max(1, Number.parseInt(String(url.searchParams.get('page') || '1'), 10) || 1);
  const perPage = Math.min(500, Math.max(1, Number.parseInt(String(url.searchParams.get('perPage') || '100'), 10) || 100));
  const projectId = String(url.searchParams.get('projectId') || '').trim();
  const taskId = String(url.searchParams.get('taskId') || '').trim();
  const agentId = String(url.searchParams.get('agentId') || '').trim();
  const model = String(url.searchParams.get('model') || '').trim();

  const fromRaw = String(url.searchParams.get('from') || '').trim();
  const from = fromRaw ? new Date(fromRaw) : null;
  const toRaw = String(url.searchParams.get('to') || '').trim();
  const to = toRaw ? new Date(toRaw) : null;

  const filters: string[] = [];
  if (projectId) filters.push(`projectId = "${pbFilterString(projectId)}"`);
  if (taskId) filters.push(`taskId = "${pbFilterString(taskId)}"`);
  if (agentId) filters.push(`agentId = "${pbFilterString(agentId)}"`);
  if (model) filters.push(`model = "${pbFilterString(model)}"`);
  if (from && !Number.isNaN(from.getTime())) filters.push(`ts >= "${pbDateForFilter(from)}"`);
  if (to && !Number.isNaN(to.getTime())) filters.push(`ts <= "${pbDateForFilter(to)}"`);

  const q = new URLSearchParams({
    page: String(page),
    perPage: String(perPage),
    sort: '-ts',
    ...(filters.length ? { filter: filters.join(' && ') } : {}),
  });
  const data = await pbFetch(`/api/collections/usage_events/records?${q.toString()}`);
  return NextResponse.json(data);
}

