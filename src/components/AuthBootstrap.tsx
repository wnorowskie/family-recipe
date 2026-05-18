'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import {
  type AuthUser,
  clearSession,
  getAccessToken,
  setSession,
} from '@/lib/authStore';

interface BootstrapResponse {
  accessToken: string;
  user: AuthUser;
}

// Mounts inside the protected (app) layout when the FastAPI auth flag is on.
// The SSR layout has already verified the session via /v1/auth/session
// (non-rotating), so the rendered UI is correct from first paint. This
// component runs after hydration to call /api/auth/bootstrap, which performs
// the single per-page rotating /v1/auth/refresh + /v1/auth/me round-trip and
// propagates the rotated cookies back to the browser.
//
// Uses fetch directly (not apiClient) because /api/auth/bootstrap is a
// same-origin Next.js route handler. apiClient prepends NEXT_PUBLIC_API_BASE_URL
// which would send the request to FastAPI instead of Next.js.

export default function AuthBootstrap({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const didRun = useRef(false);

  useEffect(() => {
    if (didRun.current) return;
    didRun.current = true;

    if (getAccessToken() !== null) return;

    fetch('/api/auth/bootstrap', {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    })
      .then(async (res) => {
        if (!res.ok) throw new Error(`bootstrap ${res.status}`);
        return res.json() as Promise<BootstrapResponse>;
      })
      .then((data) => {
        setSession(data.accessToken, data.user);
      })
      .catch(() => {
        clearSession();
        router.replace('/login');
      });
  }, [router]);

  return <>{children}</>;
}
