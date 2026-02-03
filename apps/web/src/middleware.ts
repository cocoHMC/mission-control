import { NextResponse, type NextRequest } from 'next/server';

// Minimal password gate for tailnet/LAN use.
// Browser will show a basic-auth prompt.
export function middleware(req: NextRequest) {
  const user = process.env.MC_ADMIN_USER;
  const pass = process.env.MC_ADMIN_PASSWORD;

  const isPlaceholder = (value?: string) => {
    if (!value) return true;
    const normalized = value.trim().toLowerCase();
    return normalized === 'change-me' || normalized === 'changeme';
  };

  // If credentials are missing/placeholder, force first-run setup instead of leaving the UI open.
  const configured = Boolean(user && pass && !isPlaceholder(user) && !isPlaceholder(pass));
  if (!configured) {
    const pathname = req.nextUrl.pathname || '/';
    if (pathname.startsWith('/setup')) return NextResponse.next();
    return NextResponse.redirect(new URL('/setup', req.url));
  }

  const auth = req.headers.get('authorization') || '';
  const [scheme, encoded] = auth.split(' ');
  if (scheme === 'Basic' && encoded) {
    const decoded = Buffer.from(encoded, 'base64').toString('utf8');
    const [u, p] = decoded.split(':');
    if (u === user && p === pass) return NextResponse.next();
  }

  return new NextResponse('Authentication required', {
    status: 401,
    headers: {
      'WWW-Authenticate': 'Basic realm="Mission Control"',
    },
  });
}

export const config = {
  // Let API routes work without browser basic-auth so server components can fetch.
  // UI pages remain gated.
  matcher: ['/((?!api/|_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.(?:svg|png|ico)$).*)'],
};
