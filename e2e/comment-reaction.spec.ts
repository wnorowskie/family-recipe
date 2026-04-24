import { randomBytes } from 'crypto';
import { expect, test } from '@playwright/test';

/**
 * Smoke flow for #104 — comment + react on a seeded post as `claude-test`,
 * assert both land on the post detail page, and assert the resulting comment
 * notification surfaces for the post author (`e2e-author`) on /notifications.
 *
 * Covers the social loop from [docs/research/automated-testing.md]:
 * POST /api/posts/[postId]/comments, the `Reaction` polymorphism in
 * POST /api/reactions (toggle path in [src/app/api/reactions/route.ts]),
 * and the notification write-through in [src/lib/notifications.ts] (which
 * filters self-actions, hence the two-user seed).
 *
 * The main flow uses the shared `claude-test` storageState from
 * global-setup.ts; the notification assertion signs in as `e2e-author` via a
 * fresh context. Both users live in the same FamilySpace via
 * [prisma/seed.ts] `SEED_E2E=1` fixtures.
 */

test.use({ storageState: 'e2e/.auth/claude-test.json' });

const POST_ID = 'ce2epost001';
// Fresh emoji — the seed already has ❤️ from claude-test, so clicking ❤️
// would toggle it off. 🔥 starts at 0 and goes to 1.
const REACTION_EMOJI = '🔥';
const E2E_AUTHOR_USER = 'e2e-author';
const E2E_AUTHOR_PASSWORD = 'e2e-author-password';

test(
  'comment + reaction on a post persist and notify the author',
  { tag: ['@smoke'] },
  async ({ page, browser }) => {
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
    await reactionsSection
      .getByRole('button', { name: REACTION_EMOJI })
      .click();

    // Badges render as `<emoji> <count>` inside a pill span. Assert the 🔥
    // pill appears in the Reactions section with a count of 1.
    await expect(
      reactionsSection.getByText(`${REACTION_EMOJI}1`, { exact: false })
    ).toBeVisible();

    await page.reload();
    await expect(page.getByText(commentText, { exact: true })).toBeVisible();
    const reactionsSectionAfterReload = page
      .getByRole('heading', { name: 'Reactions', exact: true })
      .locator('xpath=ancestor::section[1]');
    await expect(
      reactionsSectionAfterReload.getByText(`${REACTION_EMOJI}1`, {
        exact: false,
      })
    ).toBeVisible();

    // Log in as the post author in a fresh context so we can inspect their
    // notifications page. Using context.request rather than the UI login form
    // keeps the flow tight — the signup/login UI is exercised in auth.spec.
    const authorContext = await browser.newContext();
    try {
      const loginResponse = await authorContext.request.post(
        '/api/auth/login',
        {
          data: {
            emailOrUsername: E2E_AUTHOR_USER,
            password: E2E_AUTHOR_PASSWORD,
            rememberMe: false,
          },
        }
      );
      expect(loginResponse.ok(), 'e2e-author login').toBeTruthy();

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
