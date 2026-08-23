import { headers } from 'next/headers';
import { clientIpForwardHeaders } from './apiUpstream';
import { fetchSessionUser } from './auth/bootstrapFromCookies';

// User resolver for (app) page components. The (app) layout has already
// verified the session; pages call this to get the user via FastAPI's
// non-rotating /v1/auth/session endpoint.
//
// Returns null when the session call fails. Callers must redirect to
// `/login?_se=1`, not bare `/login`: a failed session call does not clear the
// refresh_token cookie, and the middleware bounces /login → /timeline whenever
// that cookie is present unless `_se=1` marks it as a session error. Redirecting
// to bare /login would loop /timeline → /login → /timeline. See src/proxy.ts.
export async function resolvePageUser() {
  const headerStore = await headers();
  const cookieHeader = headerStore.get('cookie');
  // Forward the browser's client-IP chain so FastAPI's per-IP session limiter
  // (#265) keys on the real client, not this Next process's egress peer.
  const result = await fetchSessionUser(
    cookieHeader,
    clientIpForwardHeaders(headerStore)
  );
  if (!result.ok) return null;
  return result.user;
}
