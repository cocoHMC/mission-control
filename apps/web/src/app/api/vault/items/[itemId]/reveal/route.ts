import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch } from '@/lib/pbServer';
import { decryptSecret, isVaultConfigured } from '@/lib/vaultCrypto';
import { writeVaultAudit } from '@/lib/vaultAudit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;
  if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

  const { itemId } = await params;
  const item = await pbFetch<any>(`/api/collections/vault_items/records/${itemId}`);

  const agentId = String(item?.agent || '');
  const handle = String(item?.handle || '');
  const type = String(item?.type || '');
  const exposureMode = String(item?.exposureMode || 'inject_only');

  if (exposureMode !== 'revealable') {
    await writeVaultAudit({
      actorType: 'human',
      agentId,
      vaultItemId: itemId,
      action: 'reveal',
      status: 'deny',
      error: 'not_revealable',
      meta: { handle },
    });
    return NextResponse.json({ ok: false, error: 'This credential is set to inject-only and cannot be revealed.' }, { status: 403 });
  }

  const value = decryptSecret(
    {
      ciphertextB64: String(item?.secretCiphertext || ''),
      ivB64: String(item?.secretIv || ''),
      tagB64: String(item?.secretTag || ''),
      keyVersion: Number(item?.keyVersion || 1) || 1,
    },
    { agentId, handle, type }
  );

  await writeVaultAudit({
    actorType: 'human',
    agentId,
    vaultItemId: itemId,
    action: 'reveal',
    status: 'ok',
    meta: { handle },
  });

  return NextResponse.json(
    { ok: true, value, username: String(item?.username || '') },
    { headers: { 'cache-control': 'no-store' } }
  );
}

