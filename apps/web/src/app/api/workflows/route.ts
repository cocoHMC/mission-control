import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/workflows/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const payload = {
    name: body.name,
    description: body.description ?? '',
    kind: body.kind ?? 'manual',
    pipeline: body.pipeline ?? '',
    createdAt: body.createdAt ?? now,
    updatedAt: now,
  };
  const created = await pbFetch('/api/collections/workflows/records', { method: 'POST', body: payload });
  return NextResponse.json(created);
}

