import { randomBytes } from 'crypto';
import { expect, test, loginAndInjectCookies } from './fixtures';

/**
 * Smoke flow for #105 — log a cooked event against the seeded recipe via the
 * UI and assert it renders on the recipe detail page AND on /timeline. This
 * is the only e2e coverage of the V1-differentiating timeline union in
 * [src/lib/timeline-data.ts], exercising the POST handler in
 * [src/app/api/posts/[postId]/cooked/route.ts] and the `cooked_logged` render
 * path in [src/components/timeline/TimelineCard.tsx].
 *
 * Does a fresh login before each test (not storageState) so parallel runs
 * don't race on token rotation via AuthBootstrap. The seeded recipe id
 * `e2e-recipe-001` is written by `SEED_E2E=1` in prisma/seed.ts.
 *
 * Each run appends a new cooked event — the note carries a unique stamp so
 * assertions can't collide with the seeded cooked event or prior runs.
 *
 * Post-cutover (#241) the cooked-event form posts same-origin to
 * /v1/posts/{id}/cooked through the Next forwarder — there is no
 * NEXT_PUBLIC_API_BASE_URL prerequisite, so this @smoke flow runs against both
 * the CI sandbox and the live dev deploy (the stale skip guard was removed in
 * #273).
 */

const RECIPE_POST_ID = 'ce2erecipe001';
const COOKED_RATING = 5;

test(
  'logged cooked event renders on recipe detail and timeline',
  { tag: ['@smoke'] },
  async ({ page, context }) => {
    await loginAndInjectCookies(
      context,
      process.env.E2E_USER ?? 'claude-test',
      process.env.E2E_PASSWORD ?? 'claude-test-password'
    );

    const note = `E2E cooked note ${Date.now()}_${randomBytes(3).toString('hex')}`;

    await page.goto(`/posts/${RECIPE_POST_ID}`);
    await expect(page).toHaveURL(new RegExp(`/posts/${RECIPE_POST_ID}$`));

    await page.getByRole('button', { name: /^cooked this!$/i }).click();

    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible();

    await dialog.getByRole('button', { name: `${COOKED_RATING} ★` }).click();
    await dialog.getByLabel(/notes/i).fill(note);
    await dialog.getByRole('button', { name: /save cooked event/i }).click();

    await expect(dialog).toBeHidden();

    // Recent cooks on detail renders the note plain; the timeline card wraps
    // it in smart quotes (see TimelineCard.tsx).
    await expect(page.getByText(note, { exact: true })).toBeVisible();

    await page.goto('/timeline');
    await expect(page).toHaveURL(/\/timeline$/);

    await expect(page.getByText(`“${note}”`)).toBeVisible();
  }
);
