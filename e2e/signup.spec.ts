import { randomBytes } from 'crypto';
import { expect, test } from '@playwright/test';

const MASTER_KEY = process.env.FAMILY_MASTER_KEY;

/**
 * Smoke flow for #106 — the only e2e coverage of the master-key bcrypt verify
 * path. Starts logged-out, submits the signup form through the UI, and asserts
 * a session cookie is set and /timeline renders.
 *
 * Destructive: creates a real user row. Tagged `@destructive` so #107's
 * post-deploy smoke grep can invert it — this test is CI-only (ephemeral DB).
 *
 * Unlike the other smoke flows this one does NOT use storageState — it
 * deliberately boots from a fresh, unauthenticated context.
 *
 * Post-cutover (#241) the signup form posts same-origin to /v1/auth/signup
 * through the Next forwarder — no NEXT_PUBLIC_API_BASE_URL prerequisite. Still
 * gated on FAMILY_MASTER_KEY (the CI value lives in ci.yml); the stale
 * NEXT_PUBLIC_API_BASE_URL skip guard was removed in #273.
 */
test(
  'signup via master key unlocks /timeline',
  { tag: ['@smoke', '@destructive'] },
  async ({ page, context }) => {
    test.skip(
      !MASTER_KEY,
      'FAMILY_MASTER_KEY must be set for the signup flow (see ci.yml for the CI value)'
    );

    // username must be ≤ 30 chars (FastAPI SignupRequest.username max_length=30).
    // "e2e_signup_" (11) + 7 timestamp digits + 6 hex = 24 chars.
    const stamp = `${Date.now().toString().slice(-7)}${randomBytes(3).toString('hex')}`;
    const username = `e2e_signup_${stamp}`;
    // @example.com, not @example.local — FastAPI's EmailStr (email-validator)
    // rejects special-use domains like .local that Zod's .email() accepted.
    const email = `e2e-signup-${stamp}@example.com`;
    const password = 'e2e-signup-password';

    await page.goto('/signup');
    await expect(page).toHaveURL(/\/signup(\?|$)/);

    await page.getByLabel('Name', { exact: true }).fill('E2E Signup User');
    await page.getByLabel('Email', { exact: true }).fill(email);
    await page.getByLabel('Username', { exact: true }).fill(username);
    await page.getByLabel('Password', { exact: true }).fill(password);
    await page
      .getByLabel('Family Master Key', { exact: true })
      .fill(MASTER_KEY!);

    await page.getByRole('button', { name: /create account/i }).click();

    await page.waitForURL(/\/timeline$/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/timeline$/);

    const cookies = await context.cookies();
    const refreshToken = cookies.find((c) => c.name === 'refresh_token');
    // FastAPI mints a refresh token in the format "{jti}.{secret}".
    expect(refreshToken?.value).toMatch(/^[^.]+\.[^.]+$/);
  }
);
