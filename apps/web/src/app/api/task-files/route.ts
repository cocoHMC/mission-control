import { NextRequest, NextResponse } from 'next/server';
import crypto from 'node:crypto';
import { pbFetch, pbServiceToken, pbUrl } from '@/lib/pbServer';

export const runtime = 'nodejs';

function base64Url(bytes: Buffer) {
  return bytes
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function makeShareToken() {
  return base64Url(crypto.randomBytes(24));
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const q = url.searchParams.toString();
  const data = await pbFetch(`/api/collections/task_files/records${q ? `?${q}` : ''}`);
  return NextResponse.json(data);
}

export async function POST(req: NextRequest) {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const taskId = String(form.get('taskId') || '').trim();
  const rawTitle = String(form.get('title') || '').trim();
  const file = form.get('file');

  if (!taskId) return NextResponse.json({ ok: false, error: 'taskId is required' }, { status: 400 });
  if (!file || typeof file !== 'object' || typeof (file as any).arrayBuffer !== 'function') {
    return NextResponse.json({ ok: false, error: 'file is required' }, { status: 400 });
  }

  const filename = typeof (file as any).name === 'string' ? (file as any).name : 'upload.bin';
  const title = rawTitle || filename;
  const shareToken = makeShareToken();
  const now = new Date().toISOString();

  const pbForm = new FormData();
  pbForm.set('taskId', taskId);
  pbForm.set('title', title);
  pbForm.set('shareToken', shareToken);
  pbForm.set('createdAt', now);
  pbForm.set('updatedAt', now);
  pbForm.set('file', file as any, filename);

  const token = await pbServiceToken();
  const res = await fetch(new URL('/api/collections/task_files/records', pbUrl()), {
    method: 'POST',
    headers: { authorization: `Bearer ${token}` },
    body: pbForm,
    cache: 'no-store',
  });

  const text = await res.text().catch(() => '');
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = text;
  }

  if (!res.ok) {
    const msg = typeof json === 'string' ? json : json?.message || json?.error || JSON.stringify(json);
    return NextResponse.json({ ok: false, error: msg || 'Upload failed' }, { status: res.status });
  }

  return NextResponse.json(json);
}
