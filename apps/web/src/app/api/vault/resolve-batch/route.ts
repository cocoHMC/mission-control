import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { requireVaultBearer } from '@/lib/vaultAuth';
import { publicJsonError } from '@/lib/routeErrors';
import { decryptSecret, isVaultConfigured } from '@/lib/vaultCrypto';
import { writeVaultAudit } from '@/lib/vaultAudit';
import { checkVaultRateLimit } from '@/lib/vaultRateLimit';

export const runtime = 'nodejs';

type ResolveRequest = { key: string; handle: string; field?: string };

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

    const rate = checkVaultRateLimit(bearer.tokenPrefix, { limit: 600 });
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

    const requests = Array.isArray(body?.requests) ? (body.requests as ResolveRequest[]) : [];
    const sessionKey = String(body?.sessionKey || '').trim() || undefined;
    const toolName = String(body?.toolName || '').trim() || undefined;

    if (!requests.length) return NextResponse.json({ ok: false, error: 'requests required' }, { status: 400 });
    if (requests.length > 50) return NextResponse.json({ ok: false, error: 'Too many requests (max 50)' }, { status: 400 });

    // Load all items for the calling agent once (Vault is per-agent, so this is typically small).
    const q = new URLSearchParams({ page: '1', perPage: '200', filter: `agent = "${bearer.agentId}"` });
    const list = await pbFetch<{ items?: any[] }>(`/api/collections/vault_items/records?${q.toString()}`);
    const items = Array.isArray(list.items) ? list.items : [];
    const byHandle = new Map<string, any>();
    for (const it of items) {
      const h = String(it?.handle || '').trim();
      if (h) byHandle.set(h, it);
    }

    const values: Record<string, string> = {};
    const now = new Date().toISOString();
    const touchedItemIds = new Set<string>();

    for (const r of requests) {
      const key = String(r?.key || '').trim();
      const handle = String(r?.handle || '').trim();
      const field = normalizeField(r?.field);

      if (!key || !handle) {
        return NextResponse.json({ ok: false, error: 'Each request requires key + handle' }, { status: 400 });
      }

      const item = byHandle.get(handle) || null;
      if (!item) {
        await writeVaultAudit({
          actorType: 'agent',
          agentId: bearer.agentId,
          action: 'resolve',
          status: 'deny',
          sessionKey,
          toolName,
          error: 'not_found',
          meta: { handle, field, tokenPrefix: bearer.tokenPrefix, key },
        });
        return NextResponse.json({ ok: false, error: `Unknown handle: ${handle}` }, { status: 404 });
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
          meta: { handle, field, tokenPrefix: bearer.tokenPrefix, key },
        });
        return NextResponse.json({ ok: false, error: `Credential disabled: ${handle}` }, { status: 403 });
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

      values[key] = value;
      touchedItemIds.add(String(item.id || ''));

      await writeVaultAudit({
        actorType: 'agent',
        agentId: bearer.agentId,
        vaultItemId: item.id,
        action: 'resolve',
        status: 'ok',
        sessionKey,
        toolName,
        meta: { handle, field, tokenPrefix: bearer.tokenPrefix, key },
      });
    }

    // Best-effort: update lastUsedAt.
    try {
      await pbFetch(`/api/collections/vault_agent_tokens/records/${bearer.tokenId}`, { method: 'PATCH', body: { lastUsedAt: now } });
      for (const id of touchedItemIds) {
        if (!id) continue;
        await pbFetch(`/api/collections/vault_items/records/${id}`, { method: 'PATCH', body: { lastUsedAt: now } });
      }
    } catch {
      // ignore
    }

    return NextResponse.json({ ok: true, values }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return publicJsonError(err, 'Vault backend error');
  }
}
