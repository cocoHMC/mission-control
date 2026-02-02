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
  const payload = {
    title: body.title,
    description: body.description ?? '',
    status: body.status ?? 'inbox',
    priority: body.priority ?? 'p2',
    assigneeIds: body.assigneeIds ?? [],
    labels: body.labels ?? [],
    requiredNodeId: body.requiredNodeId ?? '',
    escalationAgentId: body.escalationAgentId ?? leadAgentId,
    maxAutoNudges: body.maxAutoNudges ?? 3,
  };
  const created = await pbFetch('/api/collections/tasks/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}
