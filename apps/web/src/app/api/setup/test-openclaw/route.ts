import { NextRequest, NextResponse } from 'next/server';
import { isAdminAuthConfigured, isLoopbackHost } from '@/app/api/setup/_shared';

export const runtime = 'nodejs';

type Body = {
  gatewayUrl?: string;
  token?: string;
};

function safeString(value: unknown) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeUrl(value: string) {
  try {
    return new URL(value).toString().replace(/\/$/, '');
  } catch {
    return value.trim();
  }
}

export async function POST(req: NextRequest) {
  if (isAdminAuthConfigured()) {
    return NextResponse.json({ ok: false, error: 'Setup already completed.' }, { status: 409 });
  }

  const host = req.headers.get('host') || '';
  const hostname = host.split(':')[0] || '';
  if (!isLoopbackHost(hostname)) {
    return NextResponse.json({ ok: false, error: 'Setup is only allowed from localhost.' }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid JSON body' }, { status: 400 });
  }

  const gatewayUrl = normalizeUrl(safeString(body.gatewayUrl));
  const token = safeString(body.token);
  if (!gatewayUrl) return NextResponse.json({ ok: false, error: 'Missing gatewayUrl' }, { status: 400 });
  if (!token) return NextResponse.json({ ok: false, error: 'Missing token' }, { status: 400 });

  let base: URL;
  try {
    base = new URL(gatewayUrl);
  } catch {
    return NextResponse.json({ ok: false, error: 'Invalid gatewayUrl' }, { status: 400 });
  }

  // 1) Quick health check (no auth required on local setups)
  try {
    const healthRes = await fetch(new URL('/api/health', base), { method: 'GET' });
    if (!healthRes.ok) {
      return NextResponse.json(
        { ok: false, error: `OpenClaw gateway is not healthy (${healthRes.status}). Is it running?` },
        { status: 502 }
      );
    }
  } catch {
    return NextResponse.json(
      { ok: false, error: 'Cannot reach OpenClaw gateway. Make sure it is running and the URL is correct.' },
      { status: 502 }
    );
  }

  // 2) Token check using a deterministic tool that doesn't wake the LLM.
  let invokeRes: Response;
  let invokeJson: any = null;
  try {
    invokeRes = await fetch(new URL('/tools/invoke', base), {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ tool: 'sessions_list', args: {} }),
    });
    const text = await invokeRes.text().catch(() => '');
    try {
      invokeJson = text ? JSON.parse(text) : null;
    } catch {
      invokeJson = text;
    }
  } catch {
    return NextResponse.json({ ok: false, error: 'tools/invoke request failed.' }, { status: 502 });
  }

  if (!invokeRes.ok) {
    const msg =
      typeof invokeJson === 'object' && invokeJson?.error?.message
        ? String(invokeJson.error.message)
        : typeof invokeJson === 'string'
          ? invokeJson
          : `tools/invoke failed (${invokeRes.status})`;
    return NextResponse.json(
      {
        ok: false,
        error:
          invokeRes.status === 401
            ? 'Unauthorized token. Copy the Tools Invoke token from OpenClaw → Overview.'
            : msg,
      },
      { status: 502 }
    );
  }

  let sessionCount: number | null = null;
  try {
    const text = invokeJson?.result?.content?.find((c: any) => c?.type === 'text')?.text;
    if (typeof text === 'string') {
      const parsed = JSON.parse(text);
      if (typeof parsed?.count === 'number') sessionCount = parsed.count;
    }
  } catch {
    // ignore
  }

  return NextResponse.json({ ok: true, sessionCount });
}
