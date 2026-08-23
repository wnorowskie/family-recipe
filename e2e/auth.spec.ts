import { expect, test } from '@playwright/test';

import {
  E2E_PASSWORD,
  E2E_USER,
  loginViaOrigin,
  sessionCookiesFor,
} from './auth-helpers';

/**
 * PoC flow for #58. Proves three things in one pass:
 *   1. Unauthenticated access to a gated route redirects to /login.
 *   2. The real /api/auth/login proxy accepts seed-user creds and sets a cookie.
 *   3. The cookie unlocks the gated route on Next.
 *
 * Depends on the `claude-test` seed user from prisma/seed.ts.
 *
 * Login goes through the same-origin `/api/auth/login` proxy (see
 * e2e/auth-helpers.ts); the returned cookies are already scoped to the Next
 * origin, so the middleware's cookie check passes.
 */
test('login unlocks protected /timeline', async ({ page, context }) => {
  await page.goto('/timeline');
  await expect(page).toHaveURL(/\/login(\?|$)/);

  const session = await loginViaOrigin(E2E_USER, E2E_PASSWORD);
  await context.addCookies(sessionCookiesFor(session));

  await page.goto('/timeline');
  await expect(page).toHaveURL(/\/timeline$/);
});
