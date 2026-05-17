import { NextRequest, NextResponse } from 'next/server';

import {
  createErrorResponse,
  internalError,
  API_ERROR_CODES,
} from '@/lib/apiErrors';

// Thin proxy for FastAPI /v1/auth/logout. Cookie-clearing Set-Cookie headers
// from FastAPI must reach the browser scoped to the Next.js origin; see the
// login route for the same rationale.
export const runtime = 'nodejs';

function getFastApiBaseUrl(): string | null {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (!raw) return null;
  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

export async function POST(request: NextRequest) {
  const baseUrl = getFastApiBaseUrl();
  if (!baseUrl) {
    return internalError('API not configured');
  }

  const cookieHeader = request.headers.get('cookie');
  const csrfToken = cookieHeader
    ? (() => {
        const target = 'csrf_token=';
        for (const part of cookieHeader.split(';')) {
          const trimmed = part.trim();
          if (trimmed.startsWith(target)) {
            return decodeURIComponent(trimmed.slice(target.length));
          }
        }
        return null;
      })()
    : null;

  const forwardHeaders: Record<string, string> = { Accept: 'application/json' };
  if (cookieHeader) forwardHeaders.Cookie = cookieHeader;
  if (csrfToken) forwardHeaders['X-CSRF-Token'] = csrfToken;

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/auth/logout`, {
      method: 'POST',
      headers: forwardHeaders,
    });
  } catch {
    return createErrorResponse(
      API_ERROR_CODES.INTERNAL_ERROR,
      'Upstream auth service failed',
      502
    );
  }

  const response = NextResponse.json(
    {},
    { status: upstream.ok ? 200 : upstream.status }
  );

  // Forward cookie-clearing Set-Cookie headers to the Next.js origin.
  for (const value of upstream.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', value);
  }

  return response;
}
