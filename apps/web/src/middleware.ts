import { NextResponse, type NextRequest } from 'next/server';

// Minimal password gate for tailnet/LAN use.
// Browser will show a basic-auth prompt.
export function middleware(req: NextRequest) {
  const user = process.env.MC_ADMIN_USER;
  const pass = process.env.MC_ADMIN_PASSWORD;

  // If unset, don't block (dev convenience). We'll set these for remote access.
  if (!user || !pass) return NextResponse.next();

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
  matcher: ['/((?!api/|activity$|_next/static|_next/image|favicon.ico).*)'],
};
