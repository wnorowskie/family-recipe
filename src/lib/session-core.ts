import { NextRequest, NextResponse } from 'next/server';
import { verifyToken, JWTPayload } from './jwt';

const COOKIE_NAME = 'session';
const COOKIE_MAX_AGE_DEFAULT = 7 * 24 * 60 * 60; // 7 days in seconds
const COOKIE_MAX_AGE_EXTENDED = 30 * 24 * 60 * 60; // 30 days in seconds

export function setSessionCookie(
  response: NextResponse,
  token: string,
  rememberMe: boolean = false
): void {
  const maxAge = rememberMe ? COOKIE_MAX_AGE_EXTENDED : COOKIE_MAX_AGE_DEFAULT;
  const isProduction = process.env.NODE_ENV === 'production';

  response.cookies.set({
    name: COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: isProduction,
    sameSite: 'lax',
    maxAge,
    path: '/',
  });
}

export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set({
    name: COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 0,
    path: '/',
  });
}

export async function getSessionFromRequest(
  request: NextRequest
): Promise<JWTPayload | null> {
  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  return verifyToken(token);
}

// Phase 2 dual-mode session check for the Edge middleware. Returns true if
// either a valid Next session JWT OR a FastAPI refresh_token cookie is
// present. The refresh_token check is presence-only (no JWT decode) so the
// helper stays Edge-runtime safe. Phase 4 removes the Next session branch
// entirely once the FastAPI cutover completes.
const REFRESH_COOKIE_NAME = 'refresh_token';

export async function hasAnySessionFromRequest(
  request: NextRequest
): Promise<boolean> {
  const session = await getSessionFromRequest(request);
  if (session !== null) return true;
  const refreshCookie = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  return typeof refreshCookie === 'string' && refreshCookie.length > 0;
}
