import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { requireVaultBearer } from '@/lib/vaultAuth';
import { publicJsonError } from '@/lib/routeErrors';
import { decryptSecret, isVaultConfigured } from '@/lib/vaultCrypto';
import { writeVaultAudit } from '@/lib/vaultAudit';
import { checkVaultRateLimit } from '@/lib/vaultRateLimit';

export const runtime = 'nodejs';

function normalizeField(field: string | undefined) {
  const f = String(field || '').trim().toLowerCase();
  if (!f) return 'secret';
  if (['username', 'user'].includes(f)) return 'username';
  return 'secret';
}

export async function POST(req: NextRequest) {
  try {
    if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

    const bearer = await requireVaultBearer(req);
    if (bearer instanceof NextResponse) return bearer;

    const rate = checkVaultRateLimit(bearer.tokenPrefix);
    if (!rate.allowed) {
      return NextResponse.json(
        { ok: false, error: 'Rate limit exceeded' },
        { status: 429, headers: { 'retry-after': String(Math.ceil(rate.retryAfterMs / 1000)) } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const handle = String(body?.handle || '').trim();
    const field = normalizeField(body?.field);
    const sessionKey = String(body?.sessionKey || '').trim() || undefined;
    const toolName = String(body?.toolName || '').trim() || undefined;

    if (!handle) return NextResponse.json({ ok: false, error: 'handle required' }, { status: 400 });

    // Resolve item by handle for this agent.
    const q = new URLSearchParams({ page: '1', perPage: '1', filter: `agent = "${bearer.agentId}" && handle = "${handle}"` });
    const list = await pbFetch<{ items?: any[] }>(`/api/collections/vault_items/records?${q.toString()}`);
    const item = list.items?.[0] ?? null;
    if (!item) {
      await writeVaultAudit({
        actorType: 'agent',
        agentId: bearer.agentId,
        action: 'resolve',
        status: 'deny',
        sessionKey,
        toolName,
        error: 'not_found',
        meta: { handle, field, tokenPrefix: bearer.tokenPrefix },
      });
      return NextResponse.json({ ok: false, error: 'Unknown handle' }, { status: 404 });
    }
    if (item.disabled) {
      await writeVaultAudit({
        actorType: 'agent',
        agentId: bearer.agentId,
        vaultItemId: item.id,
        action: 'resolve',
        status: 'deny',
        sessionKey,
        toolName,
        error: 'disabled',
        meta: { handle, field, tokenPrefix: bearer.tokenPrefix },
      });
      return NextResponse.json({ ok: false, error: 'Credential disabled' }, { status: 403 });
    }

    let value = '';
    if (field === 'username') {
      value = String(item.username || '');
    } else {
      value = decryptSecret(
        {
          ciphertextB64: String(item.secretCiphertext || ''),
          ivB64: String(item.secretIv || ''),
          tagB64: String(item.secretTag || ''),
          keyVersion: Number(item.keyVersion || 1) || 1,
        },
        { agentId: bearer.agentId, handle: String(item.handle || handle), type: String(item.type || '') }
      );
    }

    const now = new Date().toISOString();
    try {
      await pbFetch(`/api/collections/vault_items/records/${item.id}`, { method: 'PATCH', body: { lastUsedAt: now } });
      await pbFetch(`/api/collections/vault_agent_tokens/records/${bearer.tokenId}`, { method: 'PATCH', body: { lastUsedAt: now } });
    } catch {
      // Best-effort.
    }

    await writeVaultAudit({
      actorType: 'agent',
      agentId: bearer.agentId,
      vaultItemId: item.id,
      action: 'resolve',
      status: 'ok',
      sessionKey,
      toolName,
      meta: { handle, field, tokenPrefix: bearer.tokenPrefix },
    });

    return NextResponse.json({ ok: true, value }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return publicJsonError(err, 'Vault backend error');
  }
}
