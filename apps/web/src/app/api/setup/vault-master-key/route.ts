import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { isLoopbackHost } from '@/app/api/setup/_shared';

export const runtime = 'nodejs';

export async function GET(req: NextRequest) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;

  const host = req.headers.get('host') || '';
  const hostname = host.split(':')[0] || '';
  if (!isLoopbackHost(hostname)) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  const url = new URL(req.url);
  const confirm = String(url.searchParams.get('confirm') || '').trim();
  if (confirm !== 'show') {
    return NextResponse.json({ ok: false, error: 'confirm=show required' }, { status: 400 });
  }

  const key = String(process.env.MC_VAULT_MASTER_KEY_B64 || '').trim();
  if (!key) return NextResponse.json({ ok: false, error: 'Vault master key is not set' }, { status: 404 });

  return NextResponse.json({ ok: true, key }, { headers: { 'cache-control': 'no-store' } });
}

