import { randomBytes } from 'crypto';
import { expect, request, test } from '@playwright/test';

// Posting a comment and reacting now call apiClient.post('/v1/...') and
// apiClient.post('/v1/reactions'). Without NEXT_PUBLIC_API_BASE_URL set at
// build time those requests land on same-origin Next.js (no /v1/ routes).
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;
const FASTAPI_BASE_URL =
  process.env.FASTAPI_BASE_URL ?? 'http://localhost:8000';

/**
 * Smoke flow for #104 — comment + react on a seeded post as `claude-test`,
 * assert both land on the post detail page, and assert the resulting comment
 * notification surfaces for the post author (`e2e-author`) on /notifications.
 *
 * Covers the social loop: POST /v1/posts/{id}/comments, the Reaction
 * polymorphism in POST /v1/reactions (toggle path), and the notification
 * write-through in [src/lib/notifications.ts] (which filters self-actions,
 * hence the two-user seed).
 *
 * The main flow uses the shared `claude-test` storageState from
 * global-setup.ts; the notification assertion signs in as `e2e-author` via a
 * fresh context. Both users live in the same FamilySpace via
 * [prisma/seed.ts] `SEED_E2E=1` fixtures.
 *
 * Requires NEXT_PUBLIC_API_BASE_URL (FastAPI) — comment and reaction writes
 * call /v1/posts/{id}/comments and /v1/reactions via apiClient.
 */

test.use({ storageState: 'e2e/.auth/claude-test.json' });

const POST_ID = 'ce2epost001';
// Fresh emoji — the seed has ❤️ from claude-test, so clicking ❤️ would
// toggle it off. 🔥 is un-seeded.
const REACTION_EMOJI = '🔥';
// Must match the second user seeded by `SEED_E2E=1` in prisma/seed.ts.
const E2E_AUTHOR_USER = 'e2e-author';
const E2E_AUTHOR_PASSWORD = 'e2e-author-password';

test(
  'comment + reaction on a post persist and notify the author',
  { tag: ['@smoke'] },
  async ({ page, browser }) => {
    test.skip(
      !API_BASE_URL,
      'NEXT_PUBLIC_API_BASE_URL must be set: comment/reaction writes call /v1/ endpoints which require FastAPI'
    );

    const stamp = `${Date.now()}_${randomBytes(3).toString('hex')}`;
    const commentText = `E2E comment ${stamp}`;

    await page.goto(`/posts/${POST_ID}`);
    await expect(page).toHaveURL(new RegExp(`/posts/${POST_ID}$`));

    await page.getByPlaceholder('Share your thoughts').fill(commentText);
    await page.getByRole('button', { name: /^post comment$/i }).click();

    const commentLocator = page.getByText(commentText, { exact: true });
    await expect(commentLocator).toBeVisible();

    // The 🔥 button appears both in the post-level Reactions section and on
    // every comment card. Scope via the heading's ancestor section so we hit
    // the post-target code path.
    const reactionsSection = page
      .getByRole('heading', { name: 'Reactions', exact: true })
      .locator('xpath=ancestor::section[1]');
    const reactionPill = reactionsSection.getByText(`${REACTION_EMOJI}1`, {
      exact: false,
    });

    // POST /v1/reactions is a toggle, not additive. A CI retry (retries: 1
    // in playwright.config) reuses the seeded DB — if a prior attempt left
    // 🔥 on, clicking again would toggle it OFF and the assertion below
    // would fail deterministically. Click only when the pill is absent so
    // the end state is always "🔥 reacted".
    if ((await reactionPill.count()) === 0) {
      await reactionsSection
        .getByRole('button', { name: REACTION_EMOJI })
        .click();
    }
    await expect(reactionPill).toBeVisible();

    await page.reload();
    await expect(page.getByText(commentText, { exact: true })).toBeVisible();
    await expect(
      page
        .getByRole('heading', { name: 'Reactions', exact: true })
        .locator('xpath=ancestor::section[1]')
        .getByText(`${REACTION_EMOJI}1`, { exact: false })
    ).toBeVisible();

    // Log in as the post author in a fresh context so we can inspect their
    // notifications page. Login goes directly to FastAPI; the refresh_token
    // is then injected into the browser context scoped to the Next origin.
    const apiCtx = await request.newContext({ baseURL: FASTAPI_BASE_URL });
    const loginResponse = await apiCtx.post('/v1/auth/login', {
      data: {
        emailOrUsername: E2E_AUTHOR_USER,
        password: E2E_AUTHOR_PASSWORD,
        rememberMe: false,
      },
    });
    await apiCtx.dispose();
    expect(loginResponse.ok(), 'e2e-author login').toBeTruthy();

    const setCookieHeader = loginResponse.headers()['set-cookie'] ?? '';
    const refreshToken = extractCookieValue(setCookieHeader, 'refresh_token');
    const csrfToken = extractCookieValue(setCookieHeader, 'csrf_token');
    expect(refreshToken, 'e2e-author refresh_token').toBeTruthy();
    expect(csrfToken, 'e2e-author csrf_token').toBeTruthy();

    const authorContext = await browser.newContext();
    await authorContext.addCookies([
      {
        name: 'refresh_token',
        value: refreshToken!,
        domain: 'localhost',
        path: '/',
        httpOnly: true,
        secure: false,
        sameSite: 'Lax',
      },
      {
        name: 'csrf_token',
        value: csrfToken!,
        domain: 'localhost',
        path: '/',
        httpOnly: false,
        secure: false,
        sameSite: 'Lax',
      },
    ]);
    try {
      const authorPage = await authorContext.newPage();
      await authorPage.goto('/notifications');
      await expect(authorPage).toHaveURL(/\/notifications$/);

      // The notification body wraps comment text in smart quotes (see
      // NotificationCard.tsx), matching the render on TimelineCard.
      await expect(
        authorPage.getByText(`“${commentText}”`, { exact: true })
      ).toBeVisible();
    } finally {
      await authorContext.close();
    }
  }
);

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
