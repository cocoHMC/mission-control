import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';
import { parseVaultTokenPrefix, verifyVaultAccessToken } from '@/lib/vaultTokenHash';

type VaultAgentTokenRecord = {
  id: string;
  agent: string;
  tokenHash: string;
  tokenPrefix: string;
  disabled?: boolean;
};

type CacheEntry = { record: VaultAgentTokenRecord; expiresAt: number };

const tokenCache = new Map<string, CacheEntry>();

async function findTokenRecordByPrefix(prefix: string): Promise<VaultAgentTokenRecord | null> {
  const cached = tokenCache.get(prefix);
  if (cached && Date.now() < cached.expiresAt) return cached.record;

  const q = new URLSearchParams({ page: '1', perPage: '1', filter: `tokenPrefix = "${prefix}"` });
  const data = await pbFetch<{ items?: VaultAgentTokenRecord[] }>(`/api/collections/vault_agent_tokens/records?${q.toString()}`);
  const record = data.items?.[0] ?? null;
  if (record) {
    tokenCache.set(prefix, { record, expiresAt: Date.now() + 30_000 }); // 30s cache
  }
  return record;
}

export type VaultBearerContext = {
  agentId: string;
  tokenId: string;
  tokenPrefix: string;
};

export async function requireVaultBearer(req: NextRequest): Promise<VaultBearerContext | NextResponse> {
  const auth = req.headers.get('authorization') || '';
  const [scheme, token] = auth.split(' ');
  if (scheme !== 'Bearer' || !token) {
    return NextResponse.json({ ok: false, error: 'Vault bearer token required' }, { status: 401 });
  }

  const prefix = parseVaultTokenPrefix(token);
  if (!prefix) return NextResponse.json({ ok: false, error: 'Invalid vault token' }, { status: 401 });

  let record: VaultAgentTokenRecord | null = null;
  try {
    record = await findTokenRecordByPrefix(prefix);
  } catch {
    // Avoid leaking details to callers.
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
  }
  if (!record || record.disabled) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const ok = verifyVaultAccessToken(token, record.tokenHash);
  if (!ok) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  return { agentId: record.agent, tokenId: record.id, tokenPrefix: record.tokenPrefix };
}

