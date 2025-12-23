import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { getSessionFromRequest } from './lib/session-core';

export async function middleware(request: NextRequest) {
  const session = await getSessionFromRequest(request);
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
  if (session && isAuthPage) {
    return NextResponse.redirect(new URL('/timeline', request.url));
  }

  // If user is not logged in and trying to access protected routes, redirect to login
  if (!session && isAppRoute) {
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
