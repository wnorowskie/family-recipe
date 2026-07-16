import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasRefreshTokenFromRequest } from './lib/session-core';

// The middleware checks refresh_token presence only (no JWT decode,
// Edge-runtime safe). This is the sole auth mode — the legacy Next session
// cookie path was removed in Phase 4.4.

export function proxy(request: NextRequest) {
  const hasSession = hasRefreshTokenFromRequest(request);
  const { pathname } = request.nextUrl;

  // Check if user is accessing auth pages (login, signup)
  const isAuthPage =
    pathname.startsWith('/login') || pathname.startsWith('/signup');

  // Check if user is accessing protected app routes
  const isAppRoute =
    pathname.startsWith('/timeline') ||
    pathname.startsWith('/recipes') ||
    pathname.startsWith('/add') ||
    pathname.startsWith('/profile') ||
    pathname.startsWith('/family-members') ||
    pathname.startsWith('/notifications') ||
    pathname.startsWith('/posts');

  // If user is logged in and trying to access auth pages, redirect to timeline.
  // Exception: if the SSR layout set ?_se=1 (session error), allow the login
  // page through so the user can re-authenticate rather than looping between
  // /timeline (layout fails) → /login (middleware redirects) → repeat.
  const sessionError = request.nextUrl.searchParams.get('_se') === '1';
  if (hasSession && isAuthPage && !sessionError) {
    return NextResponse.redirect(new URL('/timeline', request.url));
  }

  // If user is not logged in and trying to access protected routes, redirect to login
  if (!hasSession && isAppRoute) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/login',
    '/signup',
    '/timeline/:path*',
    '/recipes/:path*',
    '/add/:path*',
    '/profile/:path*',
    '/family-members/:path*',
    '/notifications/:path*',
    '/posts/:path*',
  ],
};
