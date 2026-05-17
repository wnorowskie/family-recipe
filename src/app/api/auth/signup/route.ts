import { NextRequest, NextResponse } from 'next/server';

import {
  createErrorResponse,
  internalError,
  API_ERROR_CODES,
} from '@/lib/apiErrors';

// Thin proxy for FastAPI /v1/auth/signup. Same origin-scoping rationale as
// /api/auth/login — FastAPI's Set-Cookie headers must land on the Next.js
// origin so the SSR layout's cookie check sees them.
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

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/v1/auth/signup`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify(body),
    });
  } catch {
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
