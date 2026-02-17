import { NextResponse } from 'next/server';
import { pbUrl } from '@/lib/pbServer';

export const runtime = 'nodejs';

export async function GET() {
  try {
    const res = await fetch(new URL('/api/health', pbUrl()), { method: 'GET', cache: 'no-store' });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      return NextResponse.json({ ok: false, status: res.status, error: 'PocketBase healthcheck failed.', body: json }, { status: 502 });
    }
    return NextResponse.json({ ok: true, status: res.status, health: json });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'PocketBase healthcheck failed.' }, { status: 502 });
  }
}

