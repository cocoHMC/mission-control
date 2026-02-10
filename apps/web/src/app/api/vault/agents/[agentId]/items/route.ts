import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch } from '@/lib/pbServer';
import { adminJsonError } from '@/lib/routeErrors';
import { encryptSecret, isVaultConfigured } from '@/lib/vaultCrypto';
import { writeVaultAudit } from '@/lib/vaultAudit';

export const runtime = 'nodejs';

function bad(value: unknown) {
  return typeof value !== 'string' || !value.trim();
}

function sanitizeHandleBase(value: string) {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw) return '';
  // Keep the same constraints as validateHandle(): /^[A-Za-z0-9][A-Za-z0-9._-]*$/
  // but be forgiving with input by normalizing most characters to '-'.
  let out = raw.replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '');
  if (!out) return '';
  if (!/^[a-z0-9]/.test(out)) out = `h-${out}`;
  return out.slice(0, 64); // leave room for suffixes while staying <= 128 overall
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

function validateHandle(handle: string) {
  const h = handle.trim();
  if (!h) return 'Handle is required';
  if (h.length > 128) return 'Handle is too long (max 128 chars)';
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(h)) {
    return 'Handle must match /^[A-Za-z0-9][A-Za-z0-9._-]*$/';
  }
  return null;
}

async function generateUniqueHandle(agentId: string, opts: { type: string; service: string }) {
  const base = sanitizeHandleBase(opts.service) || sanitizeHandleBase(opts.type) || 'cred';
  const candidates: string[] = [base];
  // Try a few random suffixes if the base is taken.
  for (let i = 0; i < 8; i++) {
    const suffix = crypto.randomBytes(4).toString('hex').slice(0, 8);
    candidates.push(`${base}_${suffix}`);
  }

  for (const h of candidates) {
    const handleErr = validateHandle(h);
    if (handleErr) continue;
    const q = new URLSearchParams({ page: '1', perPage: '1', filter: `agent = "${agentId}" && handle = "${h}"` });
    const existing = await pbFetch<{ items?: { id: string }[] }>(`/api/collections/vault_items/records?${q.toString()}`);
    if (!existing.items?.length) return h;
  }

  throw new Error('Could not auto-generate a unique handle. Please provide one.');
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ agentId: string }> }) {
  try {
    const guard = requireAdminAuth(req);
    if (guard) return guard;
    if (!isVaultConfigured()) return NextResponse.json({ ok: false, error: 'Vault setup required' }, { status: 409 });

    const { agentId: openclawId } = await params;
    const agent = await ensurePbAgent(openclawId);
    const agentId = String(agent?.id || '').trim();
    if (!agentId) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });
    const url = new URL(req.url);
    const page = url.searchParams.get('page') || '1';
    const perPage = url.searchParams.get('perPage') || '200';
    const sort = url.searchParams.get('sort') || '-updated';

    const q = new URLSearchParams({
      page,
      perPage,
      sort,
      filter: `agent = "${agentId}"`,
    });

    const list = await pbFetch<{ items?: any[]; page: number; perPage: number; totalItems: number; totalPages: number }>(
      `/api/collections/vault_items/records?${q.toString()}`
    );
    const items = (list.items || []).map((it) => {
      // Never return encrypted blobs to the browser.
      const rest = { ...(it || {}) } as Record<string, unknown>;
      delete rest.secretCiphertext;
      delete rest.secretIv;
      delete rest.secretTag;
      return rest;
    });

    return NextResponse.json({ ...list, items });
  } catch (err) {
    return adminJsonError(err, 'Failed to load credentials');
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
      return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
    }

    const type = String(body?.type || '').trim();
    const service = String(body?.service || '').trim();
    const username = String(body?.username || '').trim();
    const notes = String(body?.notes || '').trim();
    const exposureMode = String(body?.exposureMode || 'inject_only').trim();
    const secret = String(body?.secret || '');
    const tags = body?.tags ?? null;

    if (!['api_key', 'username_password', 'oauth_refresh', 'secret'].includes(type)) {
      return NextResponse.json({ ok: false, error: 'Invalid type' }, { status: 400 });
    }

    if (!['inject_only', 'revealable'].includes(exposureMode)) {
      return NextResponse.json({ ok: false, error: 'Invalid exposureMode' }, { status: 400 });
    }

    if (bad(secret)) return NextResponse.json({ ok: false, error: 'Missing secret value' }, { status: 400 });

    let handle = String(body?.handle || '').trim();
    if (handle) {
      const handleErr = validateHandle(handle);
      if (handleErr) return NextResponse.json({ ok: false, error: handleErr }, { status: 400 });
      // Enforce uniqueness at the app layer for a cleaner error than PB's constraint.
      const q = new URLSearchParams({ page: '1', perPage: '1', filter: `agent = "${agentId}" && handle = "${handle}"` });
      const existing = await pbFetch<{ items?: { id: string }[] }>(`/api/collections/vault_items/records?${q.toString()}`);
      if (existing.items?.length) {
        return NextResponse.json({ ok: false, error: `Handle "${handle}" already exists for this agent.` }, { status: 409 });
      }
    } else {
      handle = await generateUniqueHandle(agentId, { type, service });
    }

    const enc = encryptSecret(secret, { agentId, handle, type });
    const now = new Date().toISOString();
    const payload: Record<string, unknown> = {
      agent: agentId,
      handle,
      type,
      service,
      username,
      secretCiphertext: enc.ciphertextB64,
      secretIv: enc.ivB64,
      secretTag: enc.tagB64,
      keyVersion: enc.keyVersion,
      exposureMode,
      disabled: false,
      notes,
      tags,
      lastUsedAt: '',
      lastRotatedAt: now,
    };

    const created = await pbFetch<any>('/api/collections/vault_items/records', { method: 'POST', body: payload });

    await writeVaultAudit({
      actorType: 'human',
      agentId,
      vaultItemId: created?.id,
      action: 'create',
      status: 'ok',
      meta: { handle, type, service, openclawAgentId: openclawId },
    });

    const safe = { ...(created || {}) } as Record<string, unknown>;
    delete safe.secretCiphertext;
    delete safe.secretIv;
    delete safe.secretTag;
    return NextResponse.json({ ok: true, item: safe }, { headers: { 'cache-control': 'no-store' } });
  } catch (err) {
    return adminJsonError(err, 'Create failed');
  }
}
