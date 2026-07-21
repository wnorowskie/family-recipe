import { logError } from '@/lib/logger';

// Server-side client for the FastAPI service.
//
// Post-Phase-4 the browser never talks to FastAPI directly: it issues
// same-origin `/v1/*` requests that `src/app/v1/[...path]/route.ts` forwards
// here, and the four `auth/*` proxies do the same for the login/refresh flow.
// Keeping FastAPI behind the Next origin means its `Set-Cookie` headers land
// on the origin the browser already trusts, and the service itself can stay
// IAM-private (`--no-allow-unauthenticated`) like the recipe importer.
//
// Two env vars, deliberately distinct:
//
//   NEXT_PUBLIC_API_BASE_URL — inlined into the CLIENT bundle at build time.
//     Empty in deployed builds (same-origin). Set to http://localhost:8000
//     for local dev, where the browser may hit FastAPI directly.
//
//   API_INTERNAL_URL — read at RUNTIME on the server only. The absolute
//     FastAPI URL this process forwards to. Never inlined, never public.
//
// The local-dev fallback to NEXT_PUBLIC_API_BASE_URL keeps `npm run dev`
// working with no extra config.

const IDENTITY_TOKEN_SKEW_SECONDS = 300;
const IDENTITY_TOKEN_FALLBACK_TTL_SECONDS = 1800;

function stripTrailingSlash(value: string): string {
  return value.endsWith('/') ? value.slice(0, -1) : value;
}

export function getUpstreamOrigin(): string | null {
  const internal = process.env.API_INTERNAL_URL;
  if (internal) return stripTrailingSlash(internal);

  // Local dev / CI: no separate internal URL, the public base doubles as it.
  const publicBase = process.env.NEXT_PUBLIC_API_BASE_URL;
  if (publicBase) return stripTrailingSlash(publicBase);

  return null;
}

function getAudience(origin: string): string {
  return process.env.API_INTERNAL_AUDIENCE || origin;
}

interface CachedToken {
  token: string;
  expiresAtMs: number;
}

let cachedToken: CachedToken | null = null;

// Exported for tests — module-level cache would otherwise leak across cases.
export function clearIdentityTokenCache(): void {
  cachedToken = null;
}

function decodeExpiryMs(token: string): number | null {
  const segments = token.split('.');
  if (segments.length !== 3) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(segments[1], 'base64url').toString('utf8')
    ) as { exp?: unknown };
    if (typeof payload.exp !== 'number') return null;
    return payload.exp * 1000;
  } catch {
    return null;
  }
}

// Mints a Google-signed ID token from the GCE metadata server, mirroring
// src/lib/recipeImporter.ts. Returns null when there is no audience to mint
// for (local dev against a FastAPI that isn't IAM-gated).
async function getIdentityToken(origin: string): Promise<string | null> {
  const staticToken = process.env.API_INTERNAL_STATIC_TOKEN;
  if (staticToken) return staticToken;

  // No metadata server outside GCP. Absent an explicit audience we assume the
  // upstream is unauthenticated (local dev) rather than failing the request.
  if (!process.env.API_INTERNAL_AUDIENCE && !process.env.K_SERVICE) {
    return null;
  }

  if (cachedToken && Date.now() < cachedToken.expiresAtMs) {
    return cachedToken.token;
  }

  const audience = getAudience(origin);
  const serviceAccount =
    process.env.API_INTERNAL_SERVICE_ACCOUNT_EMAIL || 'default';
  const metadataUrl =
    `http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/` +
    `${serviceAccount}/identity?audience=${encodeURIComponent(audience)}`;

  const response = await fetch(metadataUrl, {
    headers: { 'Metadata-Flavor': 'Google' },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error(
      `Failed to obtain identity token: ${response.status} ${response.statusText}`
    );
  }

  const token = (await response.text()).trim();
  const expiryMs = decodeExpiryMs(token);
  cachedToken = {
    token,
    expiresAtMs:
      expiryMs !== null
        ? expiryMs - IDENTITY_TOKEN_SKEW_SECONDS * 1000
        : Date.now() + IDENTITY_TOKEN_FALLBACK_TTL_SECONDS * 1000,
  };

  return token;
}

export class UpstreamNotConfiguredError extends Error {
  constructor() {
    super('API_INTERNAL_URL is not set');
    this.name = 'UpstreamNotConfiguredError';
  }
}

export interface UpstreamRequestInit extends Omit<RequestInit, 'headers'> {
  headers?: Record<string, string>;
}

// A minimal `get(name)` reader — satisfied by both `Headers` (route handlers)
// and Next's `ReadonlyHeaders` from `headers()` (server components).
interface HeaderReader {
  get(name: string): string | null;
}

// Extract the allowlisted client-IP headers to forward to FastAPI so its
// `_client_ip` (issue #246, `parts[-TRUSTED_PROXY_HOPS]`) resolves the real
// browser IP rather than this Next process's egress peer. Used by the
// login/signup proxies (#252) and the SSR session/refresh path (#265).
//
// Explicit allowlist by design — never blanket-copy inbound headers, which
// would let a client smuggle hop-by-hop or auth headers through the proxy.
// The X-Forwarded-For chain is forwarded verbatim; FastAPI counts trusted
// hops from the right, so a client-prepended spoof entry stays out of the
// resolved position.
export function clientIpForwardHeaders(
  source: HeaderReader
): Record<string, string> {
  const headers: Record<string, string> = {};
  const forwardedFor = source.get('x-forwarded-for');
  if (forwardedFor) headers['X-Forwarded-For'] = forwardedFor;
  const realIp = source.get('x-real-ip');
  if (realIp) headers['X-Real-IP'] = realIp;
  return headers;
}

// Issues a server-to-server request to FastAPI at `path` (e.g. `/v1/posts`).
//
// The caller's `Authorization` header is passed through untouched — it carries
// the end user's FastAPI access token. The Cloud Run IAM check rides on
// `X-Serverless-Authorization` instead, which Cloud Run consumes and strips
// before the container sees it. When both headers are present Cloud Run checks
// only `X-Serverless-Authorization`, so the two never collide.
// See https://cloud.google.com/run/docs/authenticating/service-to-service
export async function fetchUpstream(
  path: string,
  init: UpstreamRequestInit = {}
): Promise<Response> {
  const origin = getUpstreamOrigin();
  if (!origin) {
    throw new UpstreamNotConfiguredError();
  }

  const headers: Record<string, string> = { ...(init.headers ?? {}) };

  let idToken: string | null;
  try {
    idToken = await getIdentityToken(origin);
  } catch (error) {
    logError('api.upstream.identityToken', error);
    throw error;
  }
  if (idToken) {
    headers['X-Serverless-Authorization'] = `Bearer ${idToken}`;
  }

  return fetch(`${origin}${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
}
