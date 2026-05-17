import { expect, request, test } from '@playwright/test';

const TEST_USER = process.env.E2E_USER ?? 'claude-test';
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'claude-test-password';
const FASTAPI_BASE_URL =
  process.env.FASTAPI_BASE_URL ?? 'http://localhost:8000';

/**
 * PoC flow for #58. Proves three things in one pass:
 *   1. Unauthenticated access to a gated route redirects to /login.
 *   2. The real /v1/auth/login route accepts seed-user creds and sets a cookie.
 *   3. The cookie unlocks the gated route on Next (localhost:3000).
 *
 * Depends on the `claude-test` seed user from prisma/seed.ts.
 *
 * Login goes directly to FastAPI; the refresh_token value is then injected
 * into the browser context scoped to the Next origin so the middleware's
 * cookie check passes.
 */
test('login unlocks protected /timeline', async ({
  page,
  context,
  baseURL,
}) => {
  await page.goto('/timeline');
  await expect(page).toHaveURL(/\/login(\?|$)/);

  // Log in via FastAPI directly to get the refresh_token.
  const apiContext = await request.newContext({ baseURL: FASTAPI_BASE_URL });
  const login = await apiContext.post('/v1/auth/login', {
    data: {
      emailOrUsername: TEST_USER,
      password: TEST_PASSWORD,
      rememberMe: false,
    },
  });
  await apiContext.dispose();

  expect(login.ok()).toBeTruthy();

  // Re-scope both FastAPI cookies to the Next origin so the middleware and
  // SSR fetchSessionUser see them on requests to localhost:3000.
  const setCookieHeader = login.headers()['set-cookie'] ?? '';
  const refreshToken = extractCookieValue(setCookieHeader, 'refresh_token');
  const csrfToken = extractCookieValue(setCookieHeader, 'csrf_token');
  expect(refreshToken).toBeTruthy();
  expect(csrfToken).toBeTruthy();

  const nextHostname = new URL(baseURL ?? 'http://localhost:3000').hostname;
  await context.addCookies([
    {
      name: 'refresh_token',
      value: refreshToken!,
      domain: nextHostname,
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'csrf_token',
      value: csrfToken!,
      domain: nextHostname,
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);

  await page.goto('/timeline');
  await expect(page).toHaveURL(/\/timeline$/);
});

function extractCookieValue(
  setCookieHeader: string,
  name: string
): string | null {
  for (const line of setCookieHeader.split('\n')) {
    const [pair] = line.split(';');
    const eqIdx = pair.indexOf('=');
    if (eqIdx === -1) continue;
    const key = pair.slice(0, eqIdx).trim();
    if (key === name) return pair.slice(eqIdx + 1).trim();
  }
  return null;
}
