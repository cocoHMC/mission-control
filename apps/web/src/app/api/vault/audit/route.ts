import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch } from '@/lib/pbServer';
import { adminJsonError } from '@/lib/routeErrors';
import { isVaultConfigured } from '@/lib/vaultCrypto';

export const runtime = 'nodejs';

async function ensurePbAgent(openclawId: string) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `openclawAgentId = "${openclawId}" || id = "${openclawId}"`,
  });
  const existing = await pbFetch<{ items?: any[] }>(`/api/collections/agents/records?${q.toString()}`);
  const found = existing.items?.[0] ?? null;
  if (found?.id) return found;
  return pbFetch<any>('/api/collections/agents/records', {
    method: 'POST',
    body: { displayName: openclawId, role: '', openclawAgentId: openclawId, status: 'idle' },
  });
}

export async function GET(req: NextRequest) {
  try {
    const guard = requireAdminAuth(req);
    if (guard) return guard;
    if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

    const url = new URL(req.url);
    const openclawAgentId = String(url.searchParams.get('agentId') || '').trim();
    const agentId = openclawAgentId ? String((await ensurePbAgent(openclawAgentId))?.id || '').trim() : '';
    const vaultItemId = String(url.searchParams.get('vaultItemId') || '').trim();
    const page = url.searchParams.get('page') || '1';
    const perPage = url.searchParams.get('perPage') || '100';
    const sort = url.searchParams.get('sort') || '-ts';

    const filters: string[] = [];
    if (agentId) filters.push(`agent = "${agentId}"`);
    if (vaultItemId) filters.push(`vaultItem = "${vaultItemId}"`);

    const q = new URLSearchParams({
      page,
      perPage,
      sort,
      ...(filters.length ? { filter: filters.join(' && ') } : {}),
    });

    const list = await pbFetch(`/api/collections/vault_audit/records?${q.toString()}`);
    return NextResponse.json(list, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return adminJsonError(err, 'Failed to load audit log');
  }
}
