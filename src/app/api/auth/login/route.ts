import { NextRequest, NextResponse } from 'next/server';

import {
  createErrorResponse,
  internalError,
  API_ERROR_CODES,
} from '@/lib/apiErrors';

// Thin proxy for FastAPI /v1/auth/login. The browser's POST targets this
// same-origin Next.js route so that FastAPI's Set-Cookie headers land on the
// Next.js origin (localhost:3000 in dev/CI) rather than on the FastAPI
// origin. Without this proxy the browser would receive cookies scoped to
// :8000 — cookies that the Next.js middleware and SSR layout would never see
// when the browser navigates to /:3000 routes.
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
    upstream = await fetch(`${baseUrl}/v1/auth/login`, {
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

  // Forward all Set-Cookie headers so the browser receives cookies scoped to
  // the Next.js origin rather than the FastAPI origin.
  for (const value of upstream.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', value);
  }

  return response;
}
