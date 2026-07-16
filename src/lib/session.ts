import { headers } from 'next/headers';
import { fetchSessionUser } from './auth/bootstrapFromCookies';

// User resolver for (app) page components. The (app) layout has already
// verified the session; pages call this to get the user via FastAPI's
// non-rotating /v1/auth/session endpoint. Returns null when the session call
// fails so the caller can redirect to /login.
export async function resolvePageUser() {
  const headerStore = await headers();
  const cookieHeader = headerStore.get('cookie');
  const result = await fetchSessionUser(cookieHeader);
  if (!result.ok) return null;
  return result.user;
}
