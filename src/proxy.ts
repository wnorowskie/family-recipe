import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { hasAnySessionFromRequest } from './lib/session-core';

// Phase 2 dual-mode middleware: accepts either the Next session cookie or
// the FastAPI refresh_token cookie as proof of authentication. Edge-runtime
// safe — the FastAPI cookie is checked for presence only, not decoded.
// Phase 4 removes the Next branch and goes refresh_token-only.

export async function proxy(request: NextRequest) {
  const hasSession = await hasAnySessionFromRequest(request);
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

  // If user is logged in and trying to access auth pages, redirect to timeline
  if (hasSession && isAuthPage) {
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
