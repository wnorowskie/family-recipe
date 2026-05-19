import { request, test as base, type BrowserContext } from '@playwright/test';

const FASTAPI_BASE_URL =
  process.env.FASTAPI_BASE_URL ?? 'http://localhost:8000';
const E2E_USER = process.env.E2E_USER ?? 'claude-test';
const E2E_PASSWORD = process.env.E2E_PASSWORD ?? 'claude-test-password';

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

async function loginAndInjectCookies(
  context: BrowserContext,
  emailOrUsername: string,
  password: string
): Promise<void> {
  const apiCtx = await request.newContext({ baseURL: FASTAPI_BASE_URL });
  const response = await apiCtx.post('/v1/auth/login', {
    data: { emailOrUsername, password, rememberMe: false },
  });
  await apiCtx.dispose();

  if (!response.ok()) {
    throw new Error(
      `E2E login failed for "${emailOrUsername}" (${response.status()})`
    );
  }

  const setCookieHeader = response.headers()['set-cookie'] ?? '';
  const refreshToken = extractCookieValue(setCookieHeader, 'refresh_token');
  const csrfToken = extractCookieValue(setCookieHeader, 'csrf_token');

  if (!refreshToken || !csrfToken) {
    throw new Error(
      `E2E login for "${emailOrUsername}" missing cookies in response`
    );
  }

  await context.addCookies([
    {
      name: 'refresh_token',
      value: refreshToken,
      domain: 'localhost',
      path: '/',
      httpOnly: true,
      secure: false,
      sameSite: 'Lax',
    },
    {
      name: 'csrf_token',
      value: csrfToken,
      domain: 'localhost',
      path: '/',
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
}

// Extended test fixture that provides a browser context with a fresh
// `claude-test` login before each test. Avoids the storageState token-rotation
// race: with fullyParallel=true, all parallel tests that share a single
// storageState file would race to rotate the refresh_token via AuthBootstrap,
// causing all but the first to receive SESSION_FAILED on SSR.
export const test = base.extend<{ authenticatedContext: BrowserContext }>({
  authenticatedContext: async ({ browser }, use) => {
    const context = await browser.newContext();
    await loginAndInjectCookies(context, E2E_USER, E2E_PASSWORD);
    await use(context);
    await context.close();
  },
});

export { expect } from '@playwright/test';
export { loginAndInjectCookies };
