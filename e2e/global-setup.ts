import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { request, type FullConfig } from '@playwright/test';

/**
 * Logs in the seeded `claude-test` user once and saves the session cookie to
 * a storageState file. Authenticated specs opt in with:
 *
 *   test.use({ storageState: 'e2e/.auth/claude-test.json' });
 *
 * Keeps specs that need a logged-out context (auth.spec, signup.spec)
 * unaffected — they just don't opt in.
 *
 * Login goes directly to FastAPI (/v1/auth/login) via FASTAPI_BASE_URL.
 * FastAPI sets the refresh_token cookie scoped to its own origin (e.g.
 * localhost:8000). The middleware on Next (localhost:3000) checks for that
 * same cookie name — so we extract the cookie value from the FastAPI response
 * and inject it into the storage state scoped to the Next origin. This lets
 * authenticated specs work without a cross-origin cookie dance in the browser.
 */
async function globalSetup(config: FullConfig) {
  const baseURL =
    process.env.PLAYWRIGHT_BASE_URL ??
    config.projects[0]?.use?.baseURL ??
    'http://localhost:3000';

  // FastAPI serves /v1/auth/login. Defaults to localhost:8000 for local dev;
  // set FASTAPI_BASE_URL in CI to wherever FastAPI is running.
  const fastapiBaseURL =
    process.env.FASTAPI_BASE_URL ?? 'http://localhost:8000';

  const username = process.env.E2E_USER ?? 'claude-test';
  const password = process.env.E2E_PASSWORD ?? 'claude-test-password';

  const context = await request.newContext({ baseURL: fastapiBaseURL });
  const response = await context.post('/v1/auth/login', {
    data: { emailOrUsername: username, password, rememberMe: false },
  });

  if (!response.ok()) {
    throw new Error(
      `global-setup: login failed (${response.status()}). ` +
        `Is the seeded user present? See prisma/seed.ts.`
    );
  }

  // Extract both cookies from the FastAPI login response and re-scope them
  // to the Next origin. The middleware needs refresh_token (presence check);
  // the SSR layout's fetchSessionUser needs csrf_token to call /v1/auth/session.
  const setCookieHeader = response.headers()['set-cookie'] ?? '';
  const refreshToken = extractCookieValue(setCookieHeader, 'refresh_token');
  const csrfToken = extractCookieValue(setCookieHeader, 'csrf_token');

  if (!refreshToken) {
    throw new Error(
      'global-setup: FastAPI login succeeded but no refresh_token cookie in response.'
    );
  }
  if (!csrfToken) {
    throw new Error(
      'global-setup: FastAPI login succeeded but no csrf_token cookie in response.'
    );
  }

  const nextOrigin = new URL(baseURL);
  const domain = nextOrigin.hostname;
  const authDir = path.join(__dirname, '.auth');
  await mkdir(authDir, { recursive: true });

  const storageState = {
    cookies: [
      {
        name: 'refresh_token',
        value: refreshToken,
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
        value: csrfToken,
        domain,
        path: '/',
        expires: -1,
        httpOnly: false,
        secure: false,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  };

  await writeFile(
    path.join(authDir, 'claude-test.json'),
    JSON.stringify(storageState, null, 2)
  );
  await context.dispose();
}

function extractCookieValue(
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

export default globalSetup;
