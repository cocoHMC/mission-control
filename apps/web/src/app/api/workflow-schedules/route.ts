import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function safeNumber(value: unknown) {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? ''));
  return Number.isFinite(n) ? n : null;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/workflow_schedules/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const workflowId = safeString(body.workflowId);
  if (!workflowId) return NextResponse.json({ ok: false, error: 'workflowId required' }, { status: 400 });

  const intervalMinutes = safeNumber(body.intervalMinutes);
  if (intervalMinutes === null || intervalMinutes <= 0) {
    return NextResponse.json({ ok: false, error: 'intervalMinutes must be a positive number' }, { status: 400 });
  }

  const payload = {
    workflowId,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
    intervalMinutes,
    taskId: safeString(body.taskId),
    sessionKey: safeString(body.sessionKey),
    vars: body.vars ?? null,
    running: false,
    runningRunId: '',
    lastRunAt: '',
    // Default: run one interval from now to avoid immediate surprise execution.
    nextRunAt: body.nextRunAt ?? new Date(Date.now() + intervalMinutes * 60_000).toISOString(),
    createdAt: body.createdAt ?? now,
    updatedAt: now,
  };

  const created = await pbFetch('/api/collections/workflow_schedules/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}

