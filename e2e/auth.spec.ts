import { expect, test } from '@playwright/test';

const TEST_USER = process.env.E2E_USER ?? 'claude-test';
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'claude-test-password';

/**
 * PoC flow for #58. Proves three things in one pass:
 *   1. Unauthenticated access to a gated route redirects to /login.
 *   2. The real /api/auth/login route accepts seed-user creds and sets a cookie.
 *   3. The cookie unlocks the gated route.
 *
 * Depends on the `claude-test` seed user from prisma/seed.ts.
 */
test('login unlocks protected /timeline', async ({ page, context }) => {
  await page.goto('/timeline');
  await expect(page).toHaveURL(/\/login(\?|$)/);

  const login = await context.request.post('/api/auth/login', {
    data: {
      emailOrUsername: TEST_USER,
      password: TEST_PASSWORD,
      rememberMe: false,
    },
  });
  expect(login.ok()).toBeTruthy();

  await page.goto('/timeline');
  await expect(page).toHaveURL(/\/timeline$/);
});
