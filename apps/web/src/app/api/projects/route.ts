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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/projects/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const dailyBudgetUsd = parseNonNegativeNumber(body?.dailyBudgetUsd);
  const monthlyBudgetUsd = parseNonNegativeNumber(body?.monthlyBudgetUsd);
  const budgetWarnPct = parseWarnPct(body?.budgetWarnPct);
  const payload = {
    name: String(body?.name || '').trim(),
    slug: slugify(body?.slug || body?.name || ''),
    workspaceId: parseWorkspaceId(body?.workspaceId),
    description: String(body?.description || '').trim(),
    color: String(body?.color || '').trim(),
    mode: parseMode(body?.mode),
    status: parseStatus(body?.status),
    archived: parseStatus(body?.status) === 'archived' || Boolean(body?.archived ?? false),
    dailyBudgetUsd,
    monthlyBudgetUsd,
    budgetWarnPct: budgetWarnPct ?? 90,
    createdAt: now,
    updatedAt: now,
  };

  if (!payload.name) {
    return NextResponse.json({ ok: false, error: 'Project name is required.' }, { status: 400 });
  }

  const created = await pbFetch('/api/collections/projects/records', {
    method: 'POST',
    body: payload,
  });
  return NextResponse.json(created);
}
