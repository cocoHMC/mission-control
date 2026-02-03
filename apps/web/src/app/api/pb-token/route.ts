import { NextRequest, NextResponse } from 'next/server';

function isAuthorized(req: NextRequest) {
  const user = process.env.MC_ADMIN_USER;
  const pass = process.env.MC_ADMIN_PASSWORD;
  const isPlaceholder = (value?: string) => {
    if (!value) return true;
    const normalized = value.trim().toLowerCase();
    return normalized === 'change-me' || normalized === 'changeme';
  };

  if (!user || !pass || isPlaceholder(user) || isPlaceholder(pass)) return false;
  const auth = req.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme !== 'Basic' || !encoded) return false;
  const decoded = Buffer.from(encoded, 'base64').toString('utf8');
  const [u, p] = decoded.split(':');
  return u === user && p === pass;
}

export async function GET(req: NextRequest) {
  if (!isAuthorized(req)) {
    return new NextResponse('Authentication required', {
      status: 401,
      headers: { 'WWW-Authenticate': 'Basic realm="Mission Control"' },
    });
  }

  const url = process.env.PB_URL || 'http://127.0.0.1:8090';
  const identity = process.env.PB_SERVICE_EMAIL;
  const password = process.env.PB_SERVICE_PASSWORD;
  if (!identity || !password) {
    return NextResponse.json({ error: 'Missing PB_SERVICE_EMAIL/PB_SERVICE_PASSWORD' }, { status: 500 });
  }

  const res = await fetch(new URL('/api/collections/service_users/auth-with-password', url), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ identity, password }),
  });
  const json = await res.json();
  if (!res.ok) {
    return NextResponse.json({ error: 'PocketBase auth failed', detail: json }, { status: 500 });
  }

  return NextResponse.json({ token: json.token, url });
}
