import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch } from '@/lib/pbServer';
import { adminJsonError } from '@/lib/routeErrors';
import { isVaultConfigured } from '@/lib/vaultCrypto';
import { generateVaultAccessToken, hashVaultAccessToken } from '@/lib/vaultTokenHash';

export const runtime = 'nodejs';

function normalizeSort(raw: string) {
  const v = String(raw || '').trim();
  if (!v) return '';
  if (v === '-updated' || v === '-created') return '-lastUsedAt';
  const allowed = new Set(['-lastUsedAt', 'lastUsedAt', 'tokenPrefix', '-tokenPrefix', 'label', '-label']);
  return allowed.has(v) ? v : '';
}

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

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const guard = requireAdminAuth(req);
    if (guard) return guard;
    if (!isVaultConfigured()) {
      return NextResponse.json(
        { ok: false, error: 'Vault setup required', configured: false, items: [], page: 1, perPage: 0, totalItems: 0, totalPages: 0 },
        { headers: { 'cache-control': 'no-store' } }
      );
    }

    const { agentId: openclawId } = await params;
    const agent = await ensurePbAgent(openclawId);
    const agentId = String(agent?.id || '').trim();
    if (!agentId) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });

    const url = new URL(req.url);
    const page = url.searchParams.get('page') || '1';
    const perPage = url.searchParams.get('perPage') || '200';
    const sort = normalizeSort(url.searchParams.get('sort') || '') || '-lastUsedAt';

    const q = new URLSearchParams({ page, perPage, filter: `agent = "${agentId}"` });
    if (sort) q.set('sort', sort);
    const list = await pbFetch<{ items?: any[]; page: number; perPage: number; totalItems: number; totalPages: number }>(
      `/api/collections/vault_agent_tokens/records?${q.toString()}`
    );
    const items = (list.items || []).map((it) => {
      const { tokenHash, ...rest } = it || {};
      void tokenHash;
      return rest;
    });
    return NextResponse.json({ ...list, items }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return adminJsonError(err, 'Failed to load tokens');
  }
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const guard = requireAdminAuth(req);
    if (guard) return guard;
    if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

    const { agentId: openclawId } = await params;
    const agent = await ensurePbAgent(openclawId);
    const agentId = String(agent?.id || '').trim();
    if (!agentId) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });

    let body: any;
    try {
      body = await req.json();
    } catch {
      body = {};
    }

    const label = String(body?.label || '').trim();
    const { token, tokenPrefix } = generateVaultAccessToken();
    const tokenHash = hashVaultAccessToken(token);

    const record = await pbFetch<any>('/api/collections/vault_agent_tokens/records', {
      method: 'POST',
      body: {
        agent: agentId,
        label,
        tokenHash,
        tokenPrefix,
        disabled: false,
        lastUsedAt: '',
      },
    });

    const { tokenHash: _ignored, ...safe } = record || {};
    void _ignored;

    // Token is only shown once.
    return NextResponse.json({ ok: true, token, tokenPrefix, record: safe }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return adminJsonError(err, 'Token creation failed');
  }
}
