import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySession } from '@/lib/auth/session';

const PUBLIC = ['/login', '/api/auth/login'];

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const isApi = pathname.startsWith('/api/');

  // CSRF defence in depth: state-changing API calls must come from the same origin.
  if (isApi && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    const origin = req.headers.get('origin');
    if (origin && new URL(origin).host !== req.headers.get('host')) {
      return NextResponse.json({ error: { code: 'FORBIDDEN', message: 'Cross-origin request blocked.' } }, { status: 403 });
    }
  }

  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);
  if (PUBLIC.includes(pathname)) {
    if (user && pathname === '/login') return NextResponse.redirect(new URL('/dashboard', req.url));
    return NextResponse.next();
  }
  if (!user) {
    if (isApi) return NextResponse.json({ error: { code: 'UNAUTHENTICATED', message: 'Please sign in to continue.' } }, { status: 401 });
    return NextResponse.redirect(new URL('/login', req.url));
  }
  return NextResponse.next();
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|assets/).*)'] };
