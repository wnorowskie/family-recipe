import { request, type BrowserContext } from '@playwright/test';

/**
 * Shared E2E login helpers.
 *
 * Login always goes through the Next origin's same-origin `/api/auth/login`
 * proxy — never FastAPI directly. That single path works in every environment:
 *
 *   - local / CI:   E2E_ORIGIN = http://localhost:3000 (Playwright webServer)
 *                   → Next → FastAPI on :8000
 *   - dev-deploy:   E2E_ORIGIN = http://localhost:3100 (dev-auth-proxy)
 *                   → Next Cloud Run → IAM-private FastAPI
 *
 * Post-#241 FastAPI is IAM-private and only reachable through the Next origin,
 * so the old `FASTAPI_BASE_URL` (defaulting to :8000) is unreachable in the
 * dev-deploy runner. The proxy also re-scopes FastAPI's `Set-Cookie` to the
 * Next origin, so the refresh_token/csrf_token this returns are already
 * first-party — no cross-origin cookie dance. See #249.
 */

// The Playwright base origin. Mirrors the resolution in playwright.config.ts so
// the login request lands on the same host the browser navigates to.
export const E2E_ORIGIN =
  process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000';

export const E2E_USER = process.env.E2E_USER ?? 'claude-test';
export const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'claude-test-password';

export interface SessionCookies {
  refreshToken: string;
  csrfToken: string;
}

export function extractCookieValue(
  setCookieHeader: string,
  name: string
): string | null {
  // Set-Cookie headers may be concatenated with \n when multiple cookies are set.
  for (const line of setCookieHeader.split('\n')) {
    const [pair] = line.split(';');
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    if (key === name) return pair.slice(eqIdx + 1).trim();
  }
  return null;
}

/**
 * Logs a user in via the same-origin `/api/auth/login` proxy and returns the
 * two session cookies re-scoped to the Next origin. Throws on non-2xx or a
 * response missing either cookie.
 */
export async function loginViaOrigin(
  emailOrUsername: string,
  password: string
): Promise<SessionCookies> {
  const apiCtx = await request.newContext({ baseURL: E2E_ORIGIN });
  const response = await apiCtx.post('/api/auth/login', {
    data: { emailOrUsername, password, rememberMe: false },
  });
  await apiCtx.dispose();

  if (!response.ok()) {
    throw new Error(
      `E2E login failed for "${emailOrUsername}" (${response.status()}) ` +
        `via ${E2E_ORIGIN}/api/auth/login. Is the seeded user present? See prisma/seed.ts.`
    );
  }

  const setCookieHeader = response.headers()['set-cookie'] ?? '';
  const refreshToken = extractCookieValue(setCookieHeader, 'refresh_token');
  const csrfToken = extractCookieValue(setCookieHeader, 'csrf_token');

  if (!refreshToken || !csrfToken) {
    throw new Error(
      `E2E login for "${emailOrUsername}" succeeded but the response was missing ` +
        `the refresh_token/csrf_token cookie.`
    );
  }

  return { refreshToken, csrfToken };
}

/**
 * Builds the Playwright cookie records for a session, scoped to the Next
 * origin's hostname. Shape is valid for both `context.addCookies` and a
 * storageState `cookies` array. `secure: false` because the localhost hop
 * (both CI :3000 and the dev-auth-proxy :3100) is plain HTTP.
 */
export function sessionCookiesFor(
  cookies: SessionCookies,
  origin: string = E2E_ORIGIN
) {
  const domain = new URL(origin).hostname;
  return [
    {
      name: 'refresh_token',
      value: cookies.refreshToken,
      domain,
      path: '/',
      expires: -1,
      httpOnly: true,
      secure: false,
      sameSite: 'Lax' as const,
    },
    {
      // Non-httpOnly — readable by Next SSR forwarding to FastAPI /v1/auth/session.
      name: 'csrf_token',
      value: cookies.csrfToken,
      domain,
      path: '/',
      expires: -1,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax' as const,
    },
  ];
}

/**
 * Logs in and injects the resulting session cookies into a browser context.
 * The context's client then bootstraps its in-memory access token from these
 * cookies via `/api/auth/bootstrap` on first navigation.
 */
export async function loginAndInjectCookies(
  context: BrowserContext,
  emailOrUsername: string = E2E_USER,
  password: string = E2E_PASSWORD
): Promise<void> {
  const cookies = await loginViaOrigin(emailOrUsername, password);
  await context.addCookies(sessionCookiesFor(cookies));
}
