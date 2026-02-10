import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch } from '@/lib/pbServer';
import { adminJsonError } from '@/lib/routeErrors';
import { isVaultConfigured } from '@/lib/vaultCrypto';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ tokenId: string }> }) {
  try {
    const guard = requireAdminAuth(req);
    if (guard) return guard;
    if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

    const { tokenId } = await params;
    await pbFetch(`/api/collections/vault_agent_tokens/records/${tokenId}`, { method: 'PATCH', body: { disabled: true } });
    return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return adminJsonError(err, 'Disable failed');
  }
}
