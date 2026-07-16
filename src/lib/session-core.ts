import { NextRequest } from 'next/server';

const REFRESH_COOKIE_NAME = 'refresh_token';

// The middleware uses this directly — presence-only check, no JWT decode,
// Edge-runtime safe. Not an auth bypass: every protected data route still
// validates the token against FastAPI and 401s on a forgery.
export function hasRefreshTokenFromRequest(request: NextRequest): boolean {
  const cookie = request.cookies.get(REFRESH_COOKIE_NAME)?.value;
  return typeof cookie === 'string' && cookie.length > 0;
}
