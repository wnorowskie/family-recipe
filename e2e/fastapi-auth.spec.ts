import { expect, test } from '@playwright/test';

/**
 * FastAPI auth flow smoke. Tagged @fastapi-auth so it does not run with the
 * default @smoke suite — needs NEXT_PUBLIC_USE_FASTAPI_AUTH=true at build
 * time and a running FastAPI service. CI gates this behind a separate matrix
 * entry.
 *
 * Run locally:
 *   NEXT_PUBLIC_USE_FASTAPI_AUTH=true \
 *   NEXT_PUBLIC_API_BASE_URL=http://localhost:8000 \
 *     npx playwright test e2e/fastapi-auth.spec.ts --grep @fastapi-auth
 */

const TEST_USER = process.env.E2E_USER ?? 'claude-test';
const TEST_PASSWORD = process.env.E2E_PASSWORD ?? 'claude-test-password';

const FASTAPI_AUTH_ENABLED =
  process.env.NEXT_PUBLIC_USE_FASTAPI_AUTH === 'true';

test.describe('@fastapi-auth FastAPI token flow', () => {
  test.skip(
    !FASTAPI_AUTH_ENABLED,
    'NEXT_PUBLIC_USE_FASTAPI_AUTH=true required'
  );

  test('login persists across reload (refresh-on-bootstrap works)', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel(/email or username/i).fill(TEST_USER);
    await page.getByLabel(/^password$/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();

    await expect(page).toHaveURL(/\/timeline$/, { timeout: 10_000 });

    await page.reload();
    await expect(page).toHaveURL(/\/timeline$/);
  });

  test('access token is in memory only — never localStorage / sessionStorage', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel(/email or username/i).fill(TEST_USER);
    await page.getByLabel(/^password$/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/timeline$/, { timeout: 10_000 });

    const local = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i += 1) {
        const key = localStorage.key(i)!;
        out[key] = localStorage.getItem(key) ?? '';
      }
      return out;
    });
    const session = await page.evaluate(() => {
      const out: Record<string, string> = {};
      for (let i = 0; i < sessionStorage.length; i += 1) {
        const key = sessionStorage.key(i)!;
        out[key] = sessionStorage.getItem(key) ?? '';
      }
      return out;
    });

    for (const value of [...Object.values(local), ...Object.values(session)]) {
      // JWT-shaped strings have at least two dots and a base64 payload.
      expect(value).not.toMatch(/eyJ[\w-]+\.[\w-]+\.[\w-]+/);
    }
  });

  test('logout clears state and redirects subsequent navigation to /login', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel(/email or username/i).fill(TEST_USER);
    await page.getByLabel(/^password$/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/timeline$/, { timeout: 10_000 });

    await page.getByRole('button', { name: /log out/i }).click();
    await expect(page).toHaveURL(/\/login(\?|$)/, { timeout: 10_000 });

    await page.goto('/timeline');
    await expect(page).toHaveURL(/\/login(\?|$)/);
  });

  test('does not enter a refresh loop when /v1/auth/refresh keeps returning 401', async ({
    page,
  }) => {
    await page.goto('/login');
    await page.getByLabel(/email or username/i).fill(TEST_USER);
    await page.getByLabel(/^password$/i).fill(TEST_PASSWORD);
    await page.getByRole('button', { name: /log in/i }).click();
    await expect(page).toHaveURL(/\/timeline$/, { timeout: 10_000 });

    let refreshCalls = 0;
    page.on('request', (req) => {
      if (req.url().includes('/v1/auth/refresh')) refreshCalls += 1;
    });

    // Stub /v1/auth/refresh to always 401 (simulate token reuse detection).
    await page.route('**/v1/auth/refresh', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
      })
    );

    // Stub a generic API call to 401 so the client triggers refresh.
    await page.route('**/api/timeline*', (route) =>
      route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({ error: { code: 'UNAUTHORIZED' } }),
      })
    );

    await page.evaluate(() =>
      fetch('/api/timeline', { credentials: 'include' }).catch(() => null)
    );

    // Allow a short window for any retries to settle.
    await page.waitForTimeout(500);

    // Concurrent dedup + no-loop guarantee: at most one refresh per request
    // cycle even under sustained 401s. Bound at 3 to allow one cycle for the
    // SSR bootstrap path plus the explicit fetch above.
    expect(refreshCalls).toBeLessThanOrEqual(3);
  });
});
