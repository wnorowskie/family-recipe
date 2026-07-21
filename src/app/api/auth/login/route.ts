import { NextRequest, NextResponse } from 'next/server';

import {
  createErrorResponse,
  internalError,
  API_ERROR_CODES,
} from '@/lib/apiErrors';
import {
  clientIpForwardHeaders,
  fetchUpstream,
  UpstreamNotConfiguredError,
} from '@/lib/apiUpstream';

// Thin proxy for FastAPI /v1/auth/login. The browser's POST targets this
// same-origin Next.js route so that FastAPI's Set-Cookie headers land on the
// Next.js origin (localhost:3000 in dev/CI) rather than on the FastAPI
// origin. Without this proxy the browser would receive cookies scoped to
// :8000 — cookies that the Next.js middleware and SSR layout would never see
// when the browser navigates to /:3000 routes.
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return createErrorResponse(
      API_ERROR_CODES.VALIDATION_ERROR,
      'Invalid JSON body',
      400
    );
  }

  // Forward the client IP chain so FastAPI's _client_ip (issue #246) keys the
  // RefreshToken audit row and the IP-based login throttle on the real browser
  // IP rather than the Next egress peer. See clientIpForwardHeaders for the
  // allowlist rationale.
  const forwardHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    ...clientIpForwardHeaders(request.headers),
  };

  let upstream: Response;
  try {
    upstream = await fetchUpstream('/v1/auth/login', {
      method: 'POST',
      headers: forwardHeaders,
      body: JSON.stringify(body),
    });
  } catch (error) {
    if (error instanceof UpstreamNotConfiguredError) {
      return internalError('API not configured');
    }
    return createErrorResponse(
      API_ERROR_CODES.INTERNAL_ERROR,
      'Upstream auth service failed',
      502
    );
  }

  let responseBody: unknown;
  try {
    responseBody = await upstream.json();
  } catch {
    return createErrorResponse(
      API_ERROR_CODES.INTERNAL_ERROR,
      'Invalid response from auth service',
      502
    );
  }

  const response = NextResponse.json(responseBody, { status: upstream.status });

  // Forward all Set-Cookie headers so the browser receives cookies scoped to
  // the Next.js origin rather than the FastAPI origin.
  for (const value of upstream.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', value);
  }

  return response;
}
