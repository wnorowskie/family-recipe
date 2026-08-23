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

function isAuthUserShape(value: unknown): value is AuthUser {
  if (!value || typeof value !== 'object') return false;
  const c = value as Record<string, unknown>;
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    typeof c.email === 'string' &&
    typeof c.username === 'string' &&
    typeof c.role === 'string' &&
    typeof c.familySpaceId === 'string'
  );
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
  onRefreshed: (accessToken, userPayload) => {
    const user =
      snapshot.user ?? (isAuthUserShape(userPayload) ? userPayload : null);
    if (user === null) {
      clearSession();
      return;
    }
    setSession(accessToken, user);
  },
  onRefreshFailed: clearSession,
});
