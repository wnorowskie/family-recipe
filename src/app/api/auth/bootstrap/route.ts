import { NextRequest, NextResponse } from 'next/server';

import {
  API_ERROR_CODES,
  createErrorResponse,
  internalError,
  unauthorizedError,
} from '@/lib/apiErrors';
import { bootstrapAccessToken } from '@/lib/auth/bootstrapFromCookies';

// Bootstrap endpoint for the Phase 2 FastAPI auth flow.
//
// Why this exists: the FastAPI access token lives only in the client's memory,
// so on every page load the client needs a fresh token. The browser holds a
// refresh cookie that's scoped to FastAPI's domain, but cookie rotation has to
// be honored on the response — and `cookies().set()` is not allowed inside
// server components. This route handler is the only place that can refresh
// AND set the rotated cookies on the response.
//
// `withAuth` is intentionally NOT applied: the route forwards opaque FastAPI
// refresh + csrf cookies and lets FastAPI itself perform the credential check.
// The Next session JWT is irrelevant here.
//
// Called once per page load by <AuthBootstrap> after hydration. The
// (app)/layout SSR uses the non-rotating `fetchSessionUser` helper instead,
// so the chain advances exactly once per page load (this route) rather than
// once per render path.

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const cookieHeader = request.headers.get('cookie');
  const result = await bootstrapAccessToken(cookieHeader);

  if (!result.ok) {
    switch (result.reason) {
      case 'CONFIG':
        return internalError('API not configured');
      case 'MISSING_COOKIES':
      case 'REFRESH_FAILED':
      case 'REFRESH_INVALID':
      case 'ME_FAILED':
      case 'ME_INVALID':
        return unauthorizedError('Not authenticated');
      case 'NETWORK':
        return createErrorResponse(
          API_ERROR_CODES.INTERNAL_ERROR,
          'Upstream auth service failed',
          502
        );
    }
  }

  const response = NextResponse.json(
    { accessToken: result.accessToken, user: result.user },
    { status: 200 }
  );

  // Forward FastAPI's rotated refresh + csrf cookies to the browser.
  for (const setCookie of result.setCookies) {
    response.headers.append('Set-Cookie', setCookie);
  }

  return response;
}
