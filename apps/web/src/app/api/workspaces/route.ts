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

function parseArchived(value: unknown) {
  if (typeof value === 'boolean') return value;
  const raw = String(value || '').trim().toLowerCase();
  return ['1', 'true', 'yes', 'y', 'on', 'archived'].includes(raw);
}

function normalizeWorkspacePath(value: unknown) {
  return String(value || '').trim();
}

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams.toString();
  const data = await pbFetch(`/api/collections/workspaces/records?${q}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const now = new Date().toISOString();
  const name = String(body?.name || '').trim();
  if (!name) {
    return NextResponse.json({ ok: false, error: 'Workspace name is required.' }, { status: 400 });
  }

  const payload = {
    name,
    slug: slugify(body?.slug || name),
    description: String(body?.description || '').trim(),
    openclawWorkspacePath: normalizeWorkspacePath(body?.openclawWorkspacePath),
    archived: parseArchived(body?.archived),
    createdAt: now,
    updatedAt: now,
  };

  const created = await pbFetch('/api/collections/workspaces/records', {
    method: 'POST',
    body: payload,
  });
  return NextResponse.json(created);
}
