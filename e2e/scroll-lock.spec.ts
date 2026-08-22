import { expect, test, type Page } from '@playwright/test';
import { seedRecords, removeRecordsFor } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';

/**
 * **The page freezes IN PLACE while a record is out** (§10b, step 15 unit 5).
 *
 * The wall scrolled under a record fixed to the camera, and they separated. The
 * fix locks the page — but the load-bearing part is that the scroll POSITION is
 * preserved, not reset: `overflow: hidden` alone jumps to the top on some
 * browsers, which is the "wall re-centres and the slot moves" failure the lock
 * exists to prevent, arriving by accident.
 *
 * So this asserts the position is UNCHANGED across pull and return, and that a
 * scroll attempt while out does nothing — on a touch project, because touch is
 * where the drag scrolled the wall away.
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
  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  /*
    Sweep a grid of viewport-relative points rather than a single Y: the canvas
    may extend above the fold when scrolled, so the spine row that is on screen
    depends on the scroll, and a fixed offset misses it. Clamped to the visible
    band so every click lands inside the viewport.
  */
  const top = Math.max(box.y, 0) + 40;
  const bottom = Math.min(box.y + box.height, 844) - 40;
  for (let y = top; y < bottom; y += 60) {
    for (let offset = 20; offset < 380; offset += 12) {
      await page.mouse.click(box.x + offset, y);
      const pulled = await page.evaluate(
        () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.pulled ?? '',
      );
      if (pulled !== '') return;
    }
  }
  throw new Error('no spine hit');
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

test('the scroll position is unchanged across pull and return', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });

  /* Scroll partway down the wall, so a jump-to-top would be visible. */
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(200);
  const before = await page.evaluate(() => window.scrollY);
  expect(before, 'the wall is scrolled before the pull').toBeGreaterThan(400);

  await pullASpine(page);
  await page.waitForTimeout(2500);

  /*
    **The lock pins the page EXACTLY where the reader tapped — the wall does not
    move on pull.** The placement fix (step 15) settles the record at the visible
    viewport centre by PROJECTION, not by scrolling the wall to bring the slot to
    the middle. So the pinned offset is `before`, not a larger rise-scrolled one:
    the record floats in front of a frozen wall that stays put. The load-bearing
    claim is unchanged from the first version of this test — the pin is the real
    captured offset (not 0 / jumped-to-top) and it does not move while out — only
    the anchor is now `before` rather than a rise-displaced position.
  */
  const pinnedTop = await page.evaluate(() => document.body.style.top);
  expect(pinnedTop, 'the body is pinned, not jumped to the top').not.toBe('0px');
  expect(pinnedTop, 'the body is pinned to a real negative offset').toMatch(/^-\d+px$/);

  const lockedScrollY = Math.abs(parseInt(pinnedTop, 10));
  expect(lockedScrollY, 'the wall is frozen where the reader tapped, un-scrolled').toBe(before);

  /* A scroll attempt while out must not move the pinned position. */
  await page.mouse.wheel(0, 500);
  await page.waitForTimeout(200);
  const stillPinned = await page.evaluate(() => document.body.style.top);
  expect(stillPinned, 'scrolling while out is inert').toBe(pinnedTop);

  /*
    **Put back leaves the wall HOME — at `before`, where the reader was.** The
    wall never moved (no rise-scroll), so the continuity the freeze protects is
    that unlocking restores the same offset it captured, not the top.
  */
  await page.getByRole('button', { name: 'Put back' }).click();
  await page.waitForTimeout(1500);
  const after = await page.evaluate(() => window.scrollY);
  expect(after, `wall stayed home at ${before}, got ${after}`).toBe(before);
});

test('the body is not left locked after the record returns', async ({ page }) => {
  /*
    The lock is a temporary state; a leaked `position: fixed` on the body would
    break every subsequent scroll. Asserted separately because it is the failure
    that outlives the feature.
  */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });

  await pullASpine(page);
  await page.waitForTimeout(2000);
  await page.getByRole('button', { name: 'Put back' }).click();
  await page.waitForTimeout(1500);

  const position = await page.evaluate(() => document.body.style.position);
  expect(position, 'the body is not left fixed').not.toBe('fixed');
});
