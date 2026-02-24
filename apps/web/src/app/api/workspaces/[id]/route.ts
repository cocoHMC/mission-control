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

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const data = await pbFetch(`/api/collections/workspaces/records/${id}`);
  return NextResponse.json(data);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const payload: Record<string, unknown> = {
    ...body,
    updatedAt: new Date().toISOString(),
  };

  if ('name' in payload) payload.name = String(payload.name || '').trim();
  if ('slug' in payload) payload.slug = slugify(payload.slug);
  if ('name' in payload && !payload.slug) payload.slug = slugify(payload.name);
  if ('description' in payload) payload.description = String(payload.description || '').trim();
  if ('openclawWorkspacePath' in payload) payload.openclawWorkspacePath = normalizeWorkspacePath(payload.openclawWorkspacePath);
  if ('archived' in payload) payload.archived = parseArchived(payload.archived);

  const updated = await pbFetch(`/api/collections/workspaces/records/${id}`, {
    method: 'PATCH',
    body: payload,
  });
  return NextResponse.json(updated);
}

export async function DELETE(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '400',
      filter: `workspaceId = "${String(id || '').replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`,
    });
    const list = await pbFetch<{ items?: Array<{ id: string }> }>(`/api/collections/projects/records?${q.toString()}`);
    const projects = Array.isArray(list?.items) ? list.items : [];
    await Promise.all(
      projects.map((project) =>
        pbFetch(`/api/collections/projects/records/${project.id}`, {
          method: 'PATCH',
          body: { workspaceId: '', updatedAt: new Date().toISOString() },
        }).catch(() => null)
      )
    );
  } catch {
    // Best effort; workspace deletion should still proceed.
  }
  await pbFetch(`/api/collections/workspaces/records/${id}`, { method: 'DELETE' });
  return NextResponse.json({ ok: true });
}
