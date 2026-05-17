import { mkdir } from 'fs/promises';
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
 * The Next server (baseURL) has no /v1/ routes — only auth/bootstrap exists
 * there and it requires an existing refresh cookie, not credentials.
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

  const context = await request.newContext({ baseURL });
  const response = await context.post(`${fastapiBaseURL}/v1/auth/login`, {
    data: { emailOrUsername: username, password, rememberMe: false },
  });

  if (!response.ok()) {
    throw new Error(
      `global-setup: login failed (${response.status()}). ` +
        `Is the seeded user present? See prisma/seed.ts.`
    );
  }

  const authDir = path.join(__dirname, '.auth');
  await mkdir(authDir, { recursive: true });
  await context.storageState({ path: path.join(authDir, 'claude-test.json') });
  await context.dispose();
}

export default globalSetup;
