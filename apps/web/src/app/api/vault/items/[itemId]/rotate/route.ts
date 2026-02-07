import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch } from '@/lib/pbServer';
import { encryptSecret, isVaultConfigured } from '@/lib/vaultCrypto';
import { writeVaultAudit } from '@/lib/vaultAudit';

export const runtime = 'nodejs';

export async function POST(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;
  if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

  const { itemId } = await params;

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const secret = String(body?.secret || '');
  if (!secret.trim()) return NextResponse.json({ ok: false, error: 'Missing secret value' }, { status: 400 });

  const existing = await pbFetch<any>(`/api/collections/vault_items/records/${itemId}`);
  const agentId = String(existing?.agent || '');
  const handle = String(existing?.handle || '');
  const type = String(existing?.type || '');

  if (!agentId || !handle || !type) {
    return NextResponse.json({ ok: false, error: 'Invalid vault item' }, { status: 400 });
  }

  const enc = encryptSecret(secret, { agentId, handle, type });
  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    secretCiphertext: enc.ciphertextB64,
    secretIv: enc.ivB64,
    secretTag: enc.tagB64,
    keyVersion: enc.keyVersion,
    lastRotatedAt: now,
  };

  if (body?.username !== undefined) payload.username = String(body.username || '').trim();

  const updated = await pbFetch<any>(`/api/collections/vault_items/records/${itemId}`, { method: 'PATCH', body: payload });

  await writeVaultAudit({
    actorType: 'human',
    agentId,
    vaultItemId: itemId,
    action: 'rotate',
    status: 'ok',
    meta: { handle },
  });

  const { secretCiphertext, secretIv, secretTag, ...safe } = updated || {};
  void secretCiphertext;
  void secretIv;
  void secretTag;
  return NextResponse.json({ ok: true, item: safe }, { headers: { 'cache-control': 'no-store' } });
}

