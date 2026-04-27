import { existsSync } from 'fs';
import path from 'path';
import { randomBytes } from 'crypto';
import { expect, test } from '@playwright/test';

/**
 * Smoke flow for #103 — create a post with a photo via the UI and assert it
 * renders on /timeline. Covers the multipart upload path in
 * [src/app/api/posts/route.ts], savePhotoFile in [src/lib/uploads.ts], and the
 * timeline render in [src/components/timeline/PostPreview.tsx]: the three
 * moving parts called out in [docs/research/automated-testing.md#2-highest-value-8020-smoke-suite].
 *
 * Uses the shared `claude-test` storageState from global-setup.ts so the spec
 * starts already authenticated.
 *
 * The on-disk assertion is CI/local-only: in a deployed environment photos go
 * to GCS, not `public/uploads`. It's gated on `PLAYWRIGHT_BASE_URL` being
 * unset (webServer mode).
 */

test.use({ storageState: 'e2e/.auth/claude-test.json' });

const FIXTURE_PATH = path.join(__dirname, 'fixtures', 'sample.png');

test(
  'create post with photo renders on timeline',
  { tag: ['@smoke'] },
  async ({ page }) => {
    const title = `E2E Photo Post ${Date.now()}_${randomBytes(3).toString('hex')}`;

    await page.goto('/add');
    await expect(page).toHaveURL(/\/add$/);

    await page.getByLabel('Title').fill(title);

    // The file input is visually hidden (wrapped in a label). setInputFiles
    // targets it directly — no need to click the label first.
    await page.locator('input[type="file"]').setInputFiles(FIXTURE_PATH);

    // Cover badge on the first photo confirms the client accepted the file.
    await expect(page.getByText('Cover', { exact: true })).toBeVisible();

    await page.getByRole('button', { name: /share with family/i }).click();

    await page.waitForURL(/\/timeline$/, { timeout: 15_000 });
    await expect(page).toHaveURL(/\/timeline$/);

    const postImage = page.getByRole('img', { name: title });
    await expect(postImage).toBeVisible();

    const src = await postImage.getAttribute('src');
    expect(src, 'timeline should render the uploaded photo').toBeTruthy();

    // Local/CI only: verify the photo actually landed on disk.
    // In deployed (GCS) environments the storageKey is not path-backed.
    if (!process.env.PLAYWRIGHT_BASE_URL) {
      const match = src!.match(/\/uploads\/([^?"']+)/);
      expect(
        match,
        `expected /uploads/<key> in src, got: ${src}`
      ).not.toBeNull();
      const storageKey = decodeURIComponent(match![1]);
      const diskPath = path.join(
        process.cwd(),
        'public',
        'uploads',
        storageKey
      );
      expect(
        existsSync(diskPath),
        `expected uploaded photo at ${diskPath}`
      ).toBe(true);
    }
  }
);
