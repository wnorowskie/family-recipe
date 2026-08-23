'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';

import { tryRefresh } from '@/lib/apiClient';
import { getAccessToken } from '@/lib/authStore';

// Mounts inside the protected (app) layout when the FastAPI auth flag is on.
// The SSR layout has already verified the session via /v1/auth/session
// (non-rotating), so the rendered UI is correct from first paint. This
// component runs after hydration to call /api/auth/bootstrap via tryRefresh(),
// which performs the single per-page rotating /v1/auth/refresh + /v1/auth/me
// round-trip and propagates the rotated cookies back to the browser.
//
// Using tryRefresh() instead of raw fetch deduplicates with any concurrent
// API call that also triggers a refresh on 401, preventing a token-rotation
// race where both callers hold the same cookie and only one can win.

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

    tryRefresh().then((ok) => {
      if (!ok) {
        router.replace('/login');
      }
    });
  }, [router]);

  return <>{children}</>;
}
