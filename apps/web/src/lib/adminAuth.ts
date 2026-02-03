import { NextRequest, NextResponse } from 'next/server';

export function requireAdminAuth(req: NextRequest): NextResponse | null {
  const user = process.env.MC_ADMIN_USER;
  const pass = process.env.MC_ADMIN_PASSWORD;

  const isPlaceholder = (value?: string) => {
    if (!value) return true;
    const normalized = value.trim().toLowerCase();
    return normalized === 'change-me' || normalized === 'changeme';
  };

  if (!user || !pass || isPlaceholder(user) || isPlaceholder(pass)) {
    return NextResponse.json({ error: 'Setup required' }, { status: 409 });
  }

  const auth = req.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [u, p] = decoded.split(':');
    if (u === user && p === pass) return null;
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Mission Control"',
    },
  });
}
