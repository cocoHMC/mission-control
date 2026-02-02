import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/activities/records${q ? `?${q}` : ''}`);
  return NextResponse.json(data);
}
