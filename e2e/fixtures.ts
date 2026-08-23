import { test as base, type BrowserContext } from '@playwright/test';

import { E2E_PASSWORD, E2E_USER, loginAndInjectCookies } from './auth-helpers';

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
