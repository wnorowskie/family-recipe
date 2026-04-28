import { NextRequest, NextResponse } from 'next/server';

import { logError } from '@/lib/logger';

// Bootstrap endpoint for the Phase 2 FastAPI auth flow.
//
// Why this exists: the FastAPI access token lives only in the client's memory,
// so on every page load the client needs a fresh token. The browser holds a
// refresh cookie that's scoped to FastAPI's domain, but cookie rotation has to
// be honored on the response — and `cookies().set()` is not allowed inside
// server components. This route handler is the only place that can refresh
// AND set the rotated cookies on the response.
//
// Both the SSR (app)/layout.tsx fetch and the client-side <AuthBootstrap>
// hit this route, so cookie rotation is centralized: at most one refresh per
// page load instead of one for SSR plus one for the client.

export const runtime = 'nodejs';

interface RefreshResponse {
  accessToken?: unknown;
}

interface MeResponse {
  user?: unknown;
}

function getFastApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return '';
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function readCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) return null;
  const target = `${name}=`;
  for (const part of cookieHeader.split(';')) {
    const trimmed = part.trim();
    if (trimmed.startsWith(target)) {
      return decodeURIComponent(trimmed.slice(target.length));
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  const baseUrl = getFastApiBaseUrl();
  if (!baseUrl) {
    logError('auth.bootstrap.config', 'NEXT_PUBLIC_API_BASE_URL is not set');
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'API not configured' } },
      { status: 500 }
    );
  }

  const cookieHeader = request.headers.get('cookie');
  const csrfToken = readCookie(cookieHeader, 'csrf_token');
  if (!cookieHeader || !csrfToken) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Not authenticated' } },
      { status: 401 }
    );
  }

  const refreshHeaders: Record<string, string> = {
    Accept: 'application/json',
    Cookie: cookieHeader,
    'X-CSRF-Token': csrfToken,
  };

  let refreshResponse: Response;
  try {
    refreshResponse = await fetch(`${baseUrl}/v1/auth/refresh`, {
      method: 'POST',
      headers: refreshHeaders,
      cache: 'no-store',
    });
  } catch (error) {
    logError('auth.bootstrap.refresh.network', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: 'Refresh failed' } },
      { status: 502 }
    );
  }

  if (!refreshResponse.ok) {
    return NextResponse.json(
      { error: { code: 'UNAUTHORIZED', message: 'Refresh failed' } },
      { status: 401 }
    );
  }

  let refreshBody: RefreshResponse;
  try {
    refreshBody = (await refreshResponse.json()) as RefreshResponse;
  } catch (error) {
    logError('auth.bootstrap.refresh.parse', error);
    return NextResponse.json(
      {
        error: { code: 'INTERNAL_ERROR', message: 'Refresh response invalid' },
      },
      { status: 502 }
    );
  }

  const accessToken = refreshBody.accessToken;
  if (typeof accessToken !== 'string' || accessToken.length === 0) {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Refresh response missing token',
        },
      },
      { status: 401 }
    );
  }

  let meResponse: Response;
  try {
    meResponse = await fetch(`${baseUrl}/v1/auth/me`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      cache: 'no-store',
    });
  } catch (error) {
    logError('auth.bootstrap.me.network', error);
    return NextResponse.json(
      { error: { code: 'INTERNAL_ERROR', message: '/v1/auth/me failed' } },
      { status: 502 }
    );
  }

  if (!meResponse.ok) {
    return NextResponse.json(
      {
        error: { code: 'UNAUTHORIZED', message: '/v1/auth/me rejected token' },
      },
      { status: 401 }
    );
  }

  let meBody: MeResponse;
  try {
    meBody = (await meResponse.json()) as MeResponse;
  } catch (error) {
    logError('auth.bootstrap.me.parse', error);
    return NextResponse.json(
      {
        error: {
          code: 'INTERNAL_ERROR',
          message: '/v1/auth/me response invalid',
        },
      },
      { status: 502 }
    );
  }

  if (!meBody.user || typeof meBody.user !== 'object') {
    return NextResponse.json(
      {
        error: { code: 'INTERNAL_ERROR', message: '/v1/auth/me missing user' },
      },
      { status: 502 }
    );
  }

  const response = NextResponse.json(
    { accessToken, user: meBody.user },
    { status: 200 }
  );

  // Forward FastAPI's rotated refresh + csrf cookies to the browser.
  // `Headers.getSetCookie()` returns each Set-Cookie header separately; copying
  // them via `response.headers.append` preserves multi-cookie correctness.
  for (const setCookie of refreshResponse.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', setCookie);
  }

  return response;
}
