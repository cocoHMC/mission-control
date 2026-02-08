import { NextRequest, NextResponse } from 'next/server';
import { requireAdminAuth } from '@/lib/adminAuth';
import { pbFetch, pbServiceToken, pbUrl } from '@/lib/pbServer';
import type { Agent, PBList } from '@/lib/types';

export const runtime = 'nodejs';

function pbFilterString(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function initials(label: string) {
  const parts = String(label || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  const letters = parts
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase() ?? '')
    .join('');
  return letters || String(label || '?').trim().slice(0, 1).toUpperCase() || '?';
}

function hashHue(value: string) {
  // Deterministic hue based on a string (stable across refreshes).
  let h = 0;
  for (let i = 0; i < value.length; i++) {
    h = (h * 31 + value.charCodeAt(i)) >>> 0;
  }
  return h % 360;
}

function svgAvatar(label: string, seed: string) {
  const text = initials(label);
  const hue = hashHue(seed);
  const bg = `hsl(${hue} 70% 45%)`;
  const ring = `hsl(${hue} 70% 35%)`;
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128" role="img" aria-label="${String(
    label || 'Avatar'
  )
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="${bg}"/>
      <stop offset="1" stop-color="hsl(${hue} 70% 35%)"/>
    </linearGradient>
    <filter id="s" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.18)"/>
    </filter>
  </defs>
  <circle cx="64" cy="64" r="60" fill="url(#g)" filter="url(#s)"/>
  <circle cx="64" cy="64" r="60" fill="none" stroke="${ring}" stroke-width="4" opacity="0.5"/>
  <text x="64" y="70" text-anchor="middle" font-size="44" font-weight="700" fill="white"
    font-family="ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, \"Apple Color Emoji\", \"Segoe UI Emoji\"">
    ${text}
  </text>
</svg>`;
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

async function getAgentByIdOrOpenClawId(id: string) {
  const q = new URLSearchParams({
    page: '1',
    perPage: '1',
    filter: `openclawAgentId = "${pbFilterString(id)}" || id = "${pbFilterString(id)}"`,
  });
  const data = await pbFetch<PBList<Agent>>(`/api/collections/agents/records?${q.toString()}`);
  return data.items?.[0] ?? null;
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authRes = requireAdminAuth(req);
  if (authRes) return authRes;

  const { id: raw } = await params;
  const id = String(raw || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

  let agent: Agent | null = null;
  try {
    agent = await getAgentByIdOrOpenClawId(id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Lookup failed' }, { status: 502 });
  }

  const avatarField = agent?.avatar;
  const fileName = Array.isArray(avatarField) ? String(avatarField[0] || '') : String(avatarField || '');
  if (!agent || !agent.id || !fileName) {
    const label = agent?.displayName || agent?.openclawAgentId || id;
    const svg = svgAvatar(String(label || 'Avatar'), id);
    return new NextResponse(svg, {
      status: 200,
      headers: {
        'content-type': 'image/svg+xml; charset=utf-8',
        // Short cache: allows quickly picking up a newly uploaded avatar.
        'cache-control': 'private, max-age=300',
        'x-robots-tag': 'noindex',
      },
    });
  }

  let fileToken: string;
  try {
    const authToken = await pbServiceToken();
    fileToken = await pbFileToken(authToken);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Auth failed' }, { status: 502 });
  }

  const fileUrl = new URL(
    `/api/files/${encodeURIComponent('agents')}/${encodeURIComponent(agent.id)}/${encodeURIComponent(fileName)}`,
    pbUrl(),
  );
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

  return new NextResponse(fileRes.body, { status: 200, headers });
}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authRes = requireAdminAuth(req);
  if (authRes) return authRes;

  const { id: raw } = await params;
  const id = String(raw || '').trim();
  if (!id) return NextResponse.json({ ok: false, error: 'Missing id' }, { status: 400 });

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return NextResponse.json({ ok: false, error: 'Expected multipart/form-data' }, { status: 400 });
  }

  const avatar = form.get('avatar') ?? form.get('file');
  if (!avatar || typeof avatar !== 'object' || typeof (avatar as any).arrayBuffer !== 'function') {
    return NextResponse.json({ ok: false, error: 'avatar file is required' }, { status: 400 });
  }

  let agent: Agent | null = null;
  try {
    agent = await getAgentByIdOrOpenClawId(id);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: msg || 'Lookup failed' }, { status: 502 });
  }
  if (!agent?.id) return NextResponse.json({ ok: false, error: 'Agent not found' }, { status: 404 });

  const filename = typeof (avatar as any).name === 'string' ? (avatar as any).name : 'avatar.png';
  const pbForm = new FormData();
  pbForm.set('avatar', avatar as any, filename);

  const token = await pbServiceToken();
  const res = await fetch(new URL(`/api/collections/agents/records/${agent.id}`, pbUrl()), {
    method: 'PATCH',
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

  return NextResponse.json({ ok: true, agent: json });
}
