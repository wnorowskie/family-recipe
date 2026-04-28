import { setAccessTokenProvider, setRefreshHooks } from '@/lib/apiClient';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  username: string;
  emailOrUsername: string;
  avatarUrl: string | null;
  role: string;
  familySpaceId: string;
  familySpaceName: string | null;
}

interface AuthSnapshot {
  accessToken: string | null;
  user: AuthUser | null;
}

let snapshot: AuthSnapshot = { accessToken: null, user: null };
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function getAccessToken(): string | null {
  return snapshot.accessToken;
}

export function getUser(): AuthUser | null {
  return snapshot.user;
}

export function setSession(accessToken: string, user: AuthUser): void {
  if (snapshot.accessToken === accessToken && snapshot.user === user) return;
  snapshot = { accessToken, user };
  notify();
}

export function clearSession(): void {
  if (snapshot.accessToken === null && snapshot.user === null) return;
  snapshot = { accessToken: null, user: null };
  notify();
}

export function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getSnapshot(): AuthSnapshot {
  return snapshot;
}

setAccessTokenProvider(getAccessToken);

// Wire the apiClient's refresh-and-retry callbacks. /v1/auth/refresh returns
// only the rotated access token — the user identity carries forward from the
// existing session, so we update only the token here.
setRefreshHooks({
  onRefreshed: (accessToken) => {
    if (snapshot.user === null) {
      // Refresh succeeded but we have no user to attach the token to. Treat
      // it as a failure so the next 401 forces a clean re-login.
      clearSession();
      return;
    }
    setSession(accessToken, snapshot.user);
  },
  onRefreshFailed: clearSession,
});
