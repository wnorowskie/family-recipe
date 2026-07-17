import { NextRequest, NextResponse } from 'next/server';

import { createErrorResponse, API_ERROR_CODES } from '@/lib/apiErrors';
import {
  fetchUpstream,
  UpstreamNotConfiguredError,
  type UpstreamRequestInit,
} from '@/lib/apiUpstream';
import { logError } from '@/lib/logger';

// Same-origin passthrough to FastAPI for the whole `/v1/*` data plane.
//
// The browser calls `/v1/posts` on the Next origin; this handler forwards it
// to the IAM-private FastAPI service with a Google ID token attached. That
// keeps FastAPI off the public internet and keeps every cookie first-party,
// which is what lets the deployment work on raw `*.run.app` hostnames with no
// custom domain (`run.app` is on the Public Suffix List, so a shared cookie
// Domain across two run.app hosts is impossible — see
// docs/research/fastapi-cookie-domain-stack0.md).
//
// This is a dumb pipe, not a route handler in the Phase 4.3 sense: it holds no
// validation, no auth logic, and no knowledge of any endpoint. FastAPI remains
// the only implementation of the API.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Hard ceiling on a forwarded request body. Matches FastAPI's authoritative
// per-request cap (POSTS_TOTAL_REQUEST_MAX_BYTES in apps/api/src/routers/
// posts.py); anything larger would be rejected downstream anyway. Enforced
// here so the Next instance never buffers an oversized body — in prod this
// route is publicly reachable and unauthenticated (it is not in the
// src/proxy.ts matcher), so an unbounded read would be a memory-DoS vector.
const MAX_BODY_BYTES = 50 * 1024 * 1024;

// Reads the request body while enforcing MAX_BODY_BYTES mid-stream, so a
// missing or dishonest Content-Length cannot get past the guard. Returns null
// once the cap is exceeded; the caller turns that into a 413.
async function readBoundedBody(
  request: NextRequest
): Promise<ArrayBuffer | null> {
  const stream = request.body;
  if (!stream) return new ArrayBuffer(0);

  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_BODY_BYTES) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }

  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body.buffer;
}

// Headers that must not be copied verbatim between hops. `host` would target
// the wrong service; `content-length` is recomputed by fetch from the body we
// pass; the rest are RFC 9110 connection-scoped headers.
const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'host',
  'content-length',
  // Never let a client supply the header carrying our IAM assertion —
  // fetchUpstream is the only thing allowed to set it.
  'x-serverless-authorization',
]);

function buildForwardHeaders(request: NextRequest): Record<string, string> {
  const headers: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    if (!HOP_BY_HOP_HEADERS.has(key.toLowerCase())) {
      headers[key] = value;
    }
  });
  return headers;
}

// Response headers that belong to the Next hop rather than the upstream one.
// `set-cookie` is deliberately absent — it is re-emitted below via
// getSetCookie() so multiple cookies survive as separate headers.
const SKIPPED_RESPONSE_HEADERS = new Set([
  'connection',
  'keep-alive',
  'transfer-encoding',
  'content-encoding',
  'content-length',
  'set-cookie',
]);

async function proxy(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
): Promise<Response> {
  const { path } = await context.params;
  const search = request.nextUrl.search;
  const upstreamPath = `/v1/${path.join('/')}${search}`;

  const init: UpstreamRequestInit = {
    method: request.method,
    headers: buildForwardHeaders(request),
  };

  // GET/HEAD have no body. Everything else is buffered (not streamed) to avoid
  // the half-duplex streaming caveats of undici, but bounded by MAX_BODY_BYTES
  // so the buffer can never grow without limit. Reject early on a Content-Length
  // that already exceeds the cap; readBoundedBody re-checks mid-stream in case
  // the header is absent or lying.
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
      return createErrorResponse(
        API_ERROR_CODES.BAD_REQUEST,
        'Request body too large',
        413
      );
    }
    const body = await readBoundedBody(request);
    if (body === null) {
      return createErrorResponse(
        API_ERROR_CODES.BAD_REQUEST,
        'Request body too large',
        413
      );
    }
    if (body.byteLength > 0) {
      init.body = body;
    }
  }

  let upstream: Response;
  try {
    upstream = await fetchUpstream(upstreamPath, init);
  } catch (error) {
    if (error instanceof UpstreamNotConfiguredError) {
      logError('api.proxy.config', error);
      return createErrorResponse(
        API_ERROR_CODES.INTERNAL_ERROR,
        'API not configured',
        500
      );
    }
    logError('api.proxy.network', error);
    return createErrorResponse(
      API_ERROR_CODES.INTERNAL_ERROR,
      'Upstream API request failed',
      502
    );
  }

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
  });

  upstream.headers.forEach((value, key) => {
    if (!SKIPPED_RESPONSE_HEADERS.has(key.toLowerCase())) {
      response.headers.set(key, value);
    }
  });

  for (const cookie of upstream.headers.getSetCookie()) {
    response.headers.append('Set-Cookie', cookie);
  }

  return response;
}

export const GET = proxy;
export const POST = proxy;
export const PATCH = proxy;
export const PUT = proxy;
export const DELETE = proxy;
