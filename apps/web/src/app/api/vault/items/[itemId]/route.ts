import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch } from '@/lib/pbServer';
import { isVaultConfigured } from '@/lib/vaultCrypto';
import { writeVaultAudit } from '@/lib/vaultAudit';

export const runtime = 'nodejs';

function omitEncrypted(it: any) {
  const { secretCiphertext, secretIv, secretTag, ...rest } = it || {};
  void secretCiphertext;
  void secretIv;
  void secretTag;
  return rest;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
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

  const existing = await pbFetch<any>(`/api/collections/vault_items/records/${itemId}`);

  const payload: Record<string, unknown> = {};
  if (body?.service != null) payload.service = String(body.service || '').trim();
  if (body?.username != null) payload.username = String(body.username || '').trim();
  if (body?.notes != null) payload.notes = String(body.notes || '').trim();
  if (body?.tags !== undefined) payload.tags = body.tags;
  if (body?.exposureMode != null) payload.exposureMode = String(body.exposureMode || '').trim();
  if (body?.disabled !== undefined) payload.disabled = Boolean(body.disabled);

  if (payload.exposureMode && !['inject_only', 'revealable'].includes(String(payload.exposureMode))) {
    return NextResponse.json({ ok: false, error: 'Invalid exposureMode' }, { status: 400 });
  }

  const updated = await pbFetch<any>(`/api/collections/vault_items/records/${itemId}`, { method: 'PATCH', body: payload });

  const prevDisabled = Boolean(existing?.disabled);
  const nextDisabled = Boolean(updated?.disabled);
  const agentId = String(updated?.agent || existing?.agent || '');
  const handle = String(updated?.handle || existing?.handle || '');

  if (prevDisabled !== nextDisabled) {
    await writeVaultAudit({
      actorType: 'human',
      agentId,
      vaultItemId: itemId,
      action: nextDisabled ? 'disable' : 'enable',
      status: 'ok',
      meta: { handle },
    });
  } else {
    await writeVaultAudit({
      actorType: 'human',
      agentId,
      vaultItemId: itemId,
      action: 'update',
      status: 'ok',
      meta: { handle },
    });
  }

  return NextResponse.json({ ok: true, item: omitEncrypted(updated) }, { headers: { 'cache-control': 'no-store' } });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ itemId: string }> }) {
  const guard = requireAdminAuth(req);
  if (guard) return guard;
  if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

  const { itemId } = await params;
  const existing = await pbFetch<any>(`/api/collections/vault_items/records/${itemId}`);
  const agentId = String(existing?.agent || '');
  const handle = String(existing?.handle || '');

  await pbFetch(`/api/collections/vault_items/records/${itemId}`, { method: 'DELETE' });

  await writeVaultAudit({
    actorType: 'human',
    agentId,
    vaultItemId: itemId,
    action: 'delete',
    status: 'ok',
    meta: { handle },
  });

  return NextResponse.json({ ok: true }, { headers: { 'cache-control': 'no-store' } });
}

