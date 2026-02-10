import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/tasks/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const leadAgentId = process.env.MC_LEAD_AGENT_ID || process.env.MC_LEAD_AGENT || 'coco';
  const now = new Date().toISOString();
  const payload = {
    title: body.title,
    description: body.description ?? '',
    context: body.context ?? '',
    status: body.status ?? 'inbox',
    priority: body.priority ?? 'p2',
    aiEffort: body.aiEffort ?? 'auto',
    aiThinking: body.aiThinking ?? 'auto',
    aiModelTier: body.aiModelTier ?? 'auto',
    aiModel: body.aiModel ?? '',
    assigneeIds: body.assigneeIds ?? [],
    labels: body.labels ?? [],
    requiredNodeId: body.requiredNodeId ?? '',
    escalationAgentId: body.escalationAgentId ?? leadAgentId,
    maxAutoNudges: body.maxAutoNudges ?? 3,
    attemptCount: body.attemptCount ?? 0,
    archived: Boolean(body.archived ?? false),
    createdAt: body.createdAt ?? now,
    updatedAt: now,
    startAt: body.startAt ?? '',
    dueAt: body.dueAt ?? '',
    completedAt: '',
    requiresReview: Boolean(body.requiresReview ?? false),
    order: typeof body.order === 'number' ? body.order : Date.now(),
    subtasksTotal: 0,
    subtasksDone: 0,
  };
  const created = await pbFetch('/api/collections/tasks/records', { method: 'POST', body: payload });

  return NextResponse.json(created);
}
