import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function extractMentions(content: string) {
  const mentions = new Set<string>();
  // Avoid false positives for email addresses like "kyle@hmcf.ca".
  // We only treat @mentions as such when they are at the start of the string
  // or preceded by a non-word character.
  const regex = /(^|[^a-zA-Z0-9_])@([a-zA-Z0-9_-]{1,64})/g;
  let match = regex.exec(content);
  while (match) {
    mentions.add(match[2]);
    match = regex.exec(content);
  }
  return Array.from(mentions);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const content = String(body.content ?? '').trim();
  const taskId = String(body.taskId ?? '').trim();
  const fromAgentId = String(body.fromAgentId ?? '').trim();

  if (!content) return new NextResponse('content required', { status: 400 });
  if (!taskId) return new NextResponse('taskId required', { status: 400 });

  const mentions = extractMentions(content);
  const created = await pbFetch('/api/collections/messages/records', {
    method: 'POST',
    body: {
      taskId,
      fromAgentId,
      content,
      mentions,
    },
  });

  return NextResponse.json(created);
}

export async function GET(req: NextRequest) {
  const search = new URL(req.url).searchParams.toString();
  const data = await pbFetch(`/api/collections/messages/records${search ? `?${search}` : ''}`);
  return NextResponse.json(data);
}
