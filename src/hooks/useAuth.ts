'use client';

import { useSyncExternalStore } from 'react';

import { type AuthUser, getSnapshot, subscribe } from '@/lib/authStore';

const SERVER_SNAPSHOT = { accessToken: null, user: null };

export interface UseAuthResult {
  user: AuthUser | null;
  isAuthed: boolean;
}

export function useAuth(): UseAuthResult {
  const snapshot = useSyncExternalStore(
    subscribe,
    getSnapshot,
    () => SERVER_SNAPSHOT
  );
  return {
    user: snapshot.user,
    isAuthed: snapshot.accessToken !== null && snapshot.user !== null,
  };
}
