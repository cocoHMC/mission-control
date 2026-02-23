import { NextRequest, NextResponse } from 'next/server';
import { pbFetch } from '@/lib/pbServer';

function slugify(value: unknown) {
  const raw = String(value || '')
    .trim()
    .toLowerCase();
  if (!raw) return '';
  return raw
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function parseNonNegativeNumber(value: unknown) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

function parseWarnPct(value: unknown) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.max(1, Math.min(100, n));
}

function parseMode(value: unknown) {
  const mode = String(value || '').trim().toLowerCase();
  if (mode === 'manual' || mode === 'autopilot' || mode === 'supervised') return mode;
  return 'supervised';
}

function parseStatus(value: unknown) {
  const status = String(value || '').trim().toLowerCase();
  if (status === 'active' || status === 'paused' || status === 'archived') return status;
  return 'active';
}

function parseWorkspaceId(value: unknown) {
  return String(value || '').trim();
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/projects/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payload: Record<string, unknown> = { ...body, updatedAt: new Date().toISOString() };
  if (typeof payload.slug === 'string') payload.slug = slugify(payload.slug);
  if (typeof payload.name === 'string' && !payload.slug) payload.slug = slugify(payload.name);
  if ('dailyBudgetUsd' in payload) payload.dailyBudgetUsd = parseNonNegativeNumber(payload.dailyBudgetUsd);
  if ('monthlyBudgetUsd' in payload) payload.monthlyBudgetUsd = parseNonNegativeNumber(payload.monthlyBudgetUsd);
  if ('budgetWarnPct' in payload) payload.budgetWarnPct = parseWarnPct(payload.budgetWarnPct);
  if ('mode' in payload) payload.mode = parseMode(payload.mode);
  if ('status' in payload) payload.status = parseStatus(payload.status);
  if ('workspaceId' in payload) payload.workspaceId = parseWorkspaceId(payload.workspaceId);
  if ('status' in payload && payload.status === 'archived') payload.archived = true;
  const updated = await pbFetch(`/api/collections/projects/records/${id}`, { method: 'PATCH', body: payload });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await pbFetch(`/api/collections/projects/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}
