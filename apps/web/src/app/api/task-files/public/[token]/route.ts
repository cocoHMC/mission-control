import { NextRequest, NextResponse } from 'next/server';
import { pbFetch, pbServiceToken, pbUrl } from '@/lib/pbServer';

export const runtime = 'nodejs';

function pbFilterString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function safeFilename(value: string) {
  const v = value.replace(/[/\\\\]/g, '_').trim();
  return v || 'file';
}

type FileTokenState = { token: string; at: number };
let cachedFileToken: FileTokenState | null = null;

async function pbFileToken(authToken: string) {
  const now = Date.now();
  if (cachedFileToken && now - cachedFileToken.at < 2 * 60_000) return cachedFileToken.token; // 2m cache

  const res = await fetch(new URL('/api/files/token', pbUrl()), {
    method: 'POST',
    headers: { authorization: `Bearer ${authToken}` },
    cache: 'no-store',
  });
  const json = await res.json().catch(() => null);
  if (!res.ok || !json?.token) {
    throw new Error(typeof json === 'string' ? json : json?.message || json?.error || 'Failed to fetch file token');
  }
  cachedFileToken = { token: String(json.token), at: now };
  return cachedFileToken.token;
}

export async function GET(_: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token: raw } = await params;
  const shareToken = String(raw || '').trim();
  if (!shareToken) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 });

  let record: any = null;
  try {
    const q = new URLSearchParams({
      page: '1',
      perPage: '1',
      filter: `shareToken = "${pbFilterString(shareToken)}"`,
    });
    const data = await pbFetch<{ items?: any[] }>(`/api/collections/task_files/records?${q.toString()}`);
    record = data?.items?.[0] ?? null;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Lookup failed' }, { status: 502 });
  }

  if (!record) return NextResponse.json({ ok: false, error: 'Not found' }, { status: 404 });

  const fileField = record?.file;
  const fileName = Array.isArray(fileField) ? String(fileField[0] || '') : String(fileField || '');
  if (!fileName) return NextResponse.json({ ok: false, error: 'File missing' }, { status: 404 });

  let fileToken: string;
  try {
    const authToken = await pbServiceToken();
    // PocketBase serves protected files only via a short-lived "file token"
    // (POST /api/files/token) rather than the auth JWT directly.
    fileToken = await pbFileToken(authToken);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Auth failed' }, { status: 502 });
  }
  const fileUrl = new URL(`/api/files/${encodeURIComponent(record.collectionId || 'task_files')}/${encodeURIComponent(record.id)}/${encodeURIComponent(fileName)}`, pbUrl());
  fileUrl.searchParams.set('token', fileToken);
  const fileRes = await fetch(fileUrl, { cache: 'no-store' });

  if (!fileRes.ok) {
    const text = await fileRes.text().catch(() => '');
    return NextResponse.json({ ok: false, error: text || `Fetch failed (${fileRes.status})` }, { status: 502 });
  }

  const headers = new Headers();
  const ct = fileRes.headers.get('content-type');
  if (ct) headers.set('content-type', ct);
  headers.set('cache-control', 'private, max-age=0, no-store');
  headers.set('x-robots-tag', 'noindex');
  headers.set('content-disposition', `inline; filename="${safeFilename(fileName)}"`);

  return new NextResponse(fileRes.body, {
    status: 200,
    headers,
  });
}
