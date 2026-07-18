import { NextRequest, NextResponse } from 'next/server';

import {
  createErrorResponse,
  internalError,
  API_ERROR_CODES,
} from '@/lib/apiErrors';
import { fetchUpstream, UpstreamNotConfiguredError } from '@/lib/apiUpstream';

// Thin proxy for FastAPI /v1/auth/signup. Same origin-scoping rationale as
// /api/auth/login — FastAPI's Set-Cookie headers must land on the Next.js
// origin so the SSR layout's cookie check sees them.
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
  // RefreshToken audit row and any IP-based auth throttling on the real browser
  // IP rather than the Next egress peer. Explicit allowlist — never blanket-copy
  // inbound headers, which would let a client spoof hop-by-hop / auth headers.
  const forwardHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (forwardedFor) forwardHeaders['X-Forwarded-For'] = forwardedFor;
  const realIp = request.headers.get('x-real-ip');
  if (realIp) forwardHeaders['X-Real-IP'] = realIp;

  let upstream: Response;
  try {
    upstream = await fetchUpstream('/v1/auth/signup', {
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

  for (const value of upstream.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', value);
  }

  return response;
}
