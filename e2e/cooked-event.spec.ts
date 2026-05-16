import { randomBytes } from 'crypto';
import { expect, test } from '@playwright/test';

// The "Save cooked event" button triggers apiClient.post('/v1/posts/.../cooked').
// Without NEXT_PUBLIC_API_BASE_URL set at build time the call lands on
// same-origin Next.js which has no /v1/ routes, so the dialog never closes.
const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL;

/**
 * Smoke flow for #105 — log a cooked event against the seeded recipe via the
 * UI and assert it renders on the recipe detail page AND on /timeline. This
 * is the only e2e coverage of the V1-differentiating timeline union in
 * [src/lib/timeline-data.ts], exercising the POST handler in
 * [src/app/api/posts/[postId]/cooked/route.ts] and the `cooked_logged` render
 * path in [src/components/timeline/TimelineCard.tsx].
 *
 * Uses the shared `claude-test` storageState from global-setup.ts so the spec
 * starts already authenticated, and the deterministic seed recipe (id
 * `e2e-recipe-001`) from `SEED_E2E=1` in prisma/seed.ts.
 *
 * Each run appends a new cooked event — the note carries a unique stamp so
 * assertions can't collide with the seeded cooked event or prior runs.
 *
 * Requires NEXT_PUBLIC_API_BASE_URL (FastAPI) — the cooked event form calls
 * /v1/posts/{id}/cooked via apiClient.
 */

test.use({ storageState: 'e2e/.auth/claude-test.json' });

const RECIPE_POST_ID = 'ce2erecipe001';
const COOKED_RATING = 5;

test(
  'logged cooked event renders on recipe detail and timeline',
  { tag: ['@smoke'] },
  async ({ page }) => {
    test.skip(
      !API_BASE_URL,
      'NEXT_PUBLIC_API_BASE_URL must be set: cooked event form calls /v1/posts/{id}/cooked which requires FastAPI'
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
