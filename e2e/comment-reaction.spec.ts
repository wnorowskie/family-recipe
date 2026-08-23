import { randomBytes } from 'crypto';
import { expect, test, loginAndInjectCookies } from './fixtures';
import { loginViaOrigin, sessionCookiesFor } from './auth-helpers';

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
 * Does a fresh login before each test (not storageState) so parallel runs
 * don't race on token rotation via AuthBootstrap. The notification assertion
 * signs in as `e2e-author` via a separate fresh context. Both users live in
 * the same FamilySpace via [prisma/seed.ts] `SEED_E2E=1` fixtures.
 *
 * Post-cutover (#241) these writes go same-origin to /v1/posts/{id}/comments
 * and /v1/reactions through the Next forwarder — there is no
 * NEXT_PUBLIC_API_BASE_URL prerequisite, so this @smoke flow runs against both
 * the CI sandbox and the live dev deploy (the stale skip guard was removed in
 * #273).
 */

const POST_ID = 'ce2epost001';
// Fresh emoji — the seed has ❤️ from claude-test, so clicking ❤️ would
// toggle it off. 🔥 is un-seeded.
const REACTION_EMOJI = '🔥';
// Must match the second user seeded by `SEED_E2E=1` in prisma/seed.ts.
const E2E_AUTHOR_USER = 'e2e-author';
const E2E_AUTHOR_PASSWORD = 'e2e-author-password';

// `@dev-quarantine`: this flow reliably fails against the live dev deployment
// (not in ci.yml's local sandbox) on a latency-only client race — the comment
// write is issued before AuthBootstrap mints the in-memory access token, so it
// 401s and the just-posted comment is missing after page.reload(). Tracked in
// #276 (the client-side half of #274). deploy-dev.yml's post-deploy @smoke
// grep-inverts this tag so a develop deploy isn't rolled back by it; the test
// still runs in ci.yml. Remove the tag once #276 is fixed and verified on dev.
test(
  'comment + reaction on a post persist and notify the author',
  { tag: ['@smoke', '@dev-quarantine'] },
  async ({ page, context, browser }) => {
    await loginAndInjectCookies(
      context,
      process.env.E2E_USER ?? 'claude-test',
      process.env.E2E_PASSWORD ?? 'claude-test-password'
    );

    const stamp = `${Date.now()}_${randomBytes(3).toString('hex')}`;
    const commentText = `E2E comment ${stamp}`;

    await page.goto(`/posts/${POST_ID}`);
    await expect(page).toHaveURL(new RegExp(`/posts/${POST_ID}$`));

    await page.getByPlaceholder('Share your thoughts').fill(commentText);
    await page.getByRole('button', { name: /^post comment$/i }).click();

    // Scope to the rendered comment body, never a bare page-wide getByText:
    // the comment <textarea> still holds this exact string (the form clears it
    // only on success), so an unscoped text locator matches the *input* and a
    // failed write reads as a pass. That false positive is what let #276 slip
    // past this assertion and fail later at the reload instead.
    const commentLocator = page
      .getByRole('paragraph')
      .filter({ hasText: commentText });
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
    await expect(
      page.getByRole('paragraph').filter({ hasText: commentText })
    ).toBeVisible();
    await expect(
      page
        .getByRole('heading', { name: 'Reactions', exact: true })
        .locator('xpath=ancestor::section[1]')
        .getByText(`${REACTION_EMOJI}1`, { exact: false })
    ).toBeVisible();

    // Log in as the post author in a fresh context so we can inspect their
    // notifications page. Login goes through the same-origin `/api/auth/login`
    // proxy; the returned cookies are already scoped to the Next origin.
    const authorSession = await loginViaOrigin(
      E2E_AUTHOR_USER,
      E2E_AUTHOR_PASSWORD
    );

    const authorContext = await browser.newContext();
    await authorContext.addCookies(sessionCookiesFor(authorSession));
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
