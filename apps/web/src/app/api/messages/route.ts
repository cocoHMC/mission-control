import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function extractMentions(content: string) {
  const mentions = new Set<string>();
  const regex = /@([a-zA-Z0-9_-]+)/g;
  let match = regex.exec(content);
  while (match) {
    mentions.add(match[1]);
    match = regex.exec(content);
  }
  return Array.from(mentions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const content = body.content ?? '';
  const payload = {
    taskId: body.taskId,
    fromAgentId: body.fromAgentId ?? '',
    content,
    mentions: extractMentions(content),
  };
  const created = await pbFetch('/api/collections/messages/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}

export async function GET(req: NextRequest) {
  const search = new URL(req.url).searchParams.toString();
  const data = await pbFetch(`/api/collections/messages/records${search ? `?${search}` : ''}`);
  return NextResponse.json(data);
}
