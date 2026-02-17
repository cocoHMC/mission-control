import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((v) => safeString(v)).filter(Boolean);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [];
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/workflow_triggers/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();

  const workflowId = safeString(body.workflowId);
  if (!workflowId) return NextResponse.json({ ok: false, error: 'workflowId required' }, { status: 400 });

  const statusTo = safeString(body.statusTo);
  if (!statusTo) return NextResponse.json({ ok: false, error: 'statusTo required' }, { status: 400 });

  const event = safeString(body.event) || 'task_status_to';
  if (event !== 'task_status_to') return NextResponse.json({ ok: false, error: 'Unsupported event' }, { status: 400 });

  const payload = {
    workflowId,
    enabled: typeof body.enabled === 'boolean' ? body.enabled : true,
    event,
    statusTo,
    labelsAny: normalizeStringArray(body.labelsAny),
    sessionKey: safeString(body.sessionKey),
    vars: body.vars && typeof body.vars === 'object' ? body.vars : null,
    createdAt: now,
    updatedAt: now,
  };

  const created = await pbFetch('/api/collections/workflow_triggers/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}
