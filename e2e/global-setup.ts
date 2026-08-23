import { mkdir, writeFile } from 'fs/promises';
import path from 'path';
import { type FullConfig } from '@playwright/test';

import {
  E2E_ORIGIN,
  E2E_PASSWORD,
  E2E_USER,
  loginViaOrigin,
  sessionCookiesFor,
} from './auth-helpers';

/**
 * Logs in the seeded `claude-test` user once and saves the session cookies to
 * a storageState file. Authenticated specs opt in with:
 *
 *   test.use({ storageState: 'e2e/.auth/claude-test.json' });
 *
 * Keeps specs that need a logged-out context (auth.spec, signup.spec)
 * unaffected — they just don't opt in.
 *
 * Login goes through the Next origin's same-origin `/api/auth/login` proxy
 * (see e2e/auth-helpers.ts), which re-scopes FastAPI's cookies to the Next
 * origin. That works both in CI (Next :3000 → FastAPI :8000) and against the
 * IAM-private dev deployment (dev-auth-proxy :3100 → Next Cloud Run → FastAPI).
 */
async function globalSetup(_config: FullConfig) {
  const cookies = await loginViaOrigin(E2E_USER, E2E_PASSWORD);

  const authDir = path.join(__dirname, '.auth');
  await mkdir(authDir, { recursive: true });

  const storageState = {
    cookies: sessionCookiesFor(cookies, E2E_ORIGIN),
    origins: [],
  };

  await writeFile(
    path.join(authDir, 'claude-test.json'),
    JSON.stringify(storageState, null, 2)
  );
}

export default globalSetup;
