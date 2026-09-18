import { expect, test, type Page } from '@playwright/test';
import { seedRecords, removeRecordsFor } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';

/**
 * **The page does not move when a record comes out, and nothing is locked.**
 *
 * The lit wall scrolled under a record fixed to the camera and had to freeze
 * the body to keep the two together. The isometric wall (8a §11) draws the
 * pulled record in the same svg as its slot and the panel in the page's
 * plane beside it, so there is no rise-scroll to undo and no lock to leak.
 * The two claims the lock's tests carried survive as what they were claims
 * ABOUT: the page is never scrolled by a pull, and the body is never left
 * fixed. Since §11.13 the drawing region is the scroller (the page itself does
 * not scroll on the shelf view), and §11.22 pans THAT region to frame the
 * landing and back again on put back — so the region's position is asserted
 * to return, not to hold, and the window's to stay where it was.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function pullASpine(page: Page) {
  await page.locator('[data-seat] [data-spine]').first().click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
}

let artistId: string;

test.beforeEach(async ({ page }) => {
  const db = getTestDb();
  const rows = await db.execute(sql`INSERT INTO artists (name) VALUES ('ScrollLock Probe') RETURNING id`);
  artistId = (rows.rows[0] as { id: string }).id;
  /* Enough to make the wall taller than the viewport, so there is scroll to lock. */
  await seedRecords(artistId, 'Lock', 'probe', 120);
  await login(page);
});

test.afterEach(async () => {
  const db = getTestDb();
  await removeRecordsFor(artistId);
  await db.execute(sql`DELETE FROM artists WHERE id = ${artistId}::uuid`);
});

test('the page never scrolls, and the drawing region is back where it was after put back', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });
  const region = page.locator('[data-region="wall"]');

  /*
    Scroll the region partway down, so a jump-to-top would be visible — and
    read the position AFTER the spine is in view, because Playwright scrolls
    a click target into view itself; a reading taken before that measures
    the test's scroll, not the app's.
  */
  await region.evaluate((el) => el.scrollTo({ top: 600, behavior: 'instant' as ScrollBehavior }));
  await page.locator('[data-seat] [data-spine]').first().scrollIntoViewIfNeeded();
  await page.waitForTimeout(200);
  const before = await region.evaluate((el) => el.scrollTop);
  expect(before, 'the region is scrolled before the pull').toBeGreaterThan(100);
  expect(await page.evaluate(() => window.scrollY), 'the page itself does not scroll').toBe(0);

  await pullASpine(page);
  expect(await page.evaluate(() => window.scrollY), 'the pull did not move the page').toBe(0);
  expect(await page.evaluate(() => document.body.style.position), 'nothing is locked').not.toBe('fixed');

  await page.getByRole('button', { name: 'Put back' }).click();
  await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  await page.waitForTimeout(1200);
  expect(await page.evaluate(() => window.scrollY), 'and the return did not either').toBe(0);
  /* §11.22: the pan resolves back to the rest view, on the same clock as the return. */
  expect(await region.evaluate((el) => el.scrollTop), 'the region is back at rest').toBe(before);
});

test('the body is not left locked after the record returns', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });

  await pullASpine(page);
  await page.getByRole('button', { name: 'Put back' }).click();
  await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  await page.waitForTimeout(1200);

  const position = await page.evaluate(() => document.body.style.position);
  expect(position, 'the body is not left fixed').not.toBe('fixed');
});
