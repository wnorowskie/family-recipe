import type { AuthUser } from '@/lib/authStore';
import { logError } from '@/lib/logger';

// Server-side helpers for the FastAPI auth flow. Two distinct paths:
//
//   1. fetchSessionUser  — non-rotating. Calls /v1/auth/session. Used by
//      the (app)/layout SSR pre-render so server components can render with
//      the user before client hydration. Replay-safe by design — calling
//      this on every page render does NOT advance the refresh-token chain.
//
//   2. bootstrapAccessToken — rotating. Calls /v1/auth/refresh + /v1/auth/me.
//      Used ONLY by the /api/auth/bootstrap route handler, which needs to
//      mount the rotated Set-Cookie headers on its response (something
//      server components cannot do in Next 15). The client's <AuthBootstrap>
//      component is the only caller of /api/auth/bootstrap; it runs once on
//      mount to mint the in-memory access token.
//
// Splitting these means SSR never advances the chain, and the single chain
// rotation per page load happens via a route handler that can propagate the
// new cookies back to the browser. See issue #173 for the security rationale.

export type SessionFailure =
  | 'CONFIG'
  | 'MISSING_COOKIES'
  | 'SESSION_FAILED'
  | 'SESSION_INVALID'
  | 'NETWORK';

export type BootstrapFailure =
  | 'CONFIG'
  | 'MISSING_COOKIES'
  | 'REFRESH_FAILED'
  | 'REFRESH_INVALID'
  | 'ME_FAILED'
  | 'ME_INVALID'
  | 'NETWORK';

export interface SessionUserResult {
  ok: true;
  user: AuthUser;
}

export interface SessionUserError {
  ok: false;
  reason: SessionFailure;
}

export interface BootstrapResult {
  ok: true;
  accessToken: string;
  user: AuthUser;
  setCookies: string[];
}

export interface BootstrapError {
  ok: false;
  reason: BootstrapFailure;
}

interface MeResponseShape {
  user?: unknown;
}

interface RefreshResponseShape {
  accessToken?: unknown;
}

function getFastApiBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return null;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function readCookieFromHeader(
  cookieHeader: string,
  name: string
): string | null {
  const target = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

interface ResolvedCookies {
  baseUrl: string;
  cookieHeader: string;
  csrfToken: string;
}

function resolveCookies(
  cookieHeader: string | null
): ResolvedCookies | { reason: 'CONFIG' | 'MISSING_COOKIES' } {
  const baseUrl = getFastApiBaseUrl();
  if (!baseUrl) {
    logError('auth.bootstrap.config', 'NEXT_PUBLIC_API_BASE_URL is not set');
    return { reason: 'CONFIG' };
  }
  if (!cookieHeader) return { reason: 'MISSING_COOKIES' };
  const csrfToken = readCookieFromHeader(cookieHeader, 'csrf_token');
  if (!csrfToken) return { reason: 'MISSING_COOKIES' };
  return { baseUrl, cookieHeader, csrfToken };
}

// ---------------------------------------------------------------------------
// SSR path — non-rotating
// ---------------------------------------------------------------------------

export async function fetchSessionUser(
  cookieHeader: string | null
): Promise<SessionUserResult | SessionUserError> {
  const resolved = resolveCookies(cookieHeader);
  if ('reason' in resolved) {
    return { ok: false, reason: resolved.reason };
  }

  let response: Response;
  try {
    response = await fetch(`${resolved.baseUrl}/v1/auth/session`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Cookie: resolved.cookieHeader,
        'X-CSRF-Token': resolved.csrfToken,
      },
      cache: 'no-store',
    });
  } catch (error) {
    logError('auth.session.network', error);
    return { ok: false, reason: 'NETWORK' };
  }

  if (!response.ok) {
    return { ok: false, reason: 'SESSION_FAILED' };
  }

  let body: MeResponseShape;
  try {
    body = (await response.json()) as MeResponseShape;
  } catch (error) {
    logError('auth.session.parse', error);
    return { ok: false, reason: 'SESSION_INVALID' };
  }

  if (!body.user || typeof body.user !== 'object') {
    return { ok: false, reason: 'SESSION_INVALID' };
  }

  return { ok: true, user: body.user as AuthUser };
}

// ---------------------------------------------------------------------------
// Client-bootstrap path — rotating, called only by /api/auth/bootstrap
// ---------------------------------------------------------------------------

export async function bootstrapAccessToken(
  cookieHeader: string | null
): Promise<BootstrapResult | BootstrapError> {
  const resolved = resolveCookies(cookieHeader);
  if ('reason' in resolved) {
    return { ok: false, reason: resolved.reason };
  }

  let refreshResponse: Response;
  try {
    refreshResponse = await fetch(`${resolved.baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        Cookie: resolved.cookieHeader,
        'X-CSRF-Token': resolved.csrfToken,
      },
      cache: 'no-store',
    });
  } catch (error) {
    logError('auth.bootstrap.refresh.network', error);
    return { ok: false, reason: 'NETWORK' };
  }

  if (!refreshResponse.ok) {
    return { ok: false, reason: 'REFRESH_FAILED' };
  }

  let refreshBody: RefreshResponseShape;
  try {
    refreshBody = (await refreshResponse.json()) as RefreshResponseShape;
  } catch (error) {
    logError('auth.bootstrap.refresh.parse', error);
    return { ok: false, reason: 'REFRESH_INVALID' };
  }

  const accessToken = refreshBody.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return { ok: false, reason: 'REFRESH_INVALID' };
  }

  let meResponse: Response;
  try {
    meResponse = await fetch(`${resolved.baseUrl}/v1/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
  } catch (error) {
    logError('auth.bootstrap.me.network', error);
    return { ok: false, reason: 'NETWORK' };
  }

  if (!meResponse.ok) {
    return { ok: false, reason: 'ME_FAILED' };
  }

  let meBody: MeResponseShape;
  try {
    meBody = (await meResponse.json()) as MeResponseShape;
  } catch (error) {
    logError('auth.bootstrap.me.parse', error);
    return { ok: false, reason: 'ME_INVALID' };
  }

  if (!meBody.user || typeof meBody.user !== 'object') {
    return { ok: false, reason: 'ME_INVALID' };
  }

  return {
    ok: true,
    accessToken,
    user: meBody.user as AuthUser,
    setCookies: refreshResponse.headers.getSetCookie(),
  };
}
