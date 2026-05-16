import { randomBytes } from 'crypto';
import { expect, test } from '@playwright/test';

const MASTER_KEY = process.env.FAMILY_MASTER_KEY;
// The signup form now POSTs to /v1/auth/signup via apiClient. Without
// NEXT_PUBLIC_API_BASE_URL set at build time the request lands on same-origin
// Next.js which has no /v1/ routes, so the test would time out.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

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
 * Requires NEXT_PUBLIC_API_BASE_URL (FastAPI) in addition to FAMILY_MASTER_KEY.
 */
test(
  'signup via master key unlocks /timeline',
  { tag: ['@smoke', '@destructive'] },
  async ({ page, context }) => {
    test.skip(
      !MASTER_KEY,
      'FAMILY_MASTER_KEY must be set for the signup flow (see ci.yml for the CI value)'
    );
    test.skip(
      !API_BASE_URL,
      'NEXT_PUBLIC_API_BASE_URL must be set: signup form calls /v1/auth/signup which requires FastAPI'
    );

    const stamp = `${Date.now()}_${randomBytes(3).toString('hex')}`;
    const username = `e2e_signup_${stamp}`;
    const email = `e2e-signup-${stamp}@example.local`;
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
    const session = cookies.find((c) => c.name === 'session');
    // JWTs signed with jose always start with the base64-encoded header `eyJ`.
    expect(session?.value).toMatch(/^eyJ/);
  }
);
