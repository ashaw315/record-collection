import { expect, test, type Page } from '@playwright/test';
import { seedRecords, removeRecordsFor } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { login } from './sign-in';
import { clickSpine } from './wall-ready';

/**
 * **The page does not move when a record comes out, and nothing is locked.**
 *
 * The lit wall scrolled under a record fixed to the camera and had to freeze
 * the body to keep the two together. The isometric wall (8a §11) draws the
 * pulled record in the same svg as its slot and the panel in the page's
 * plane beside it, so there is no rise-scroll to undo and no lock to leak.
 * The two claims the lock's tests carried survive as what they were claims
 * ABOUT: the page is never scrolled by a pull, and the body is never left
 * fixed. Since §W.13 the drawing region is the scroller (the page itself does
 * not scroll on the shelf view), and §W.22 pans THAT region to frame the
 * landing and back again on put back — so the region's position is asserted
 * to return, not to hold, and the window's to stay where it was.
 */

async function pullASpine(page: Page) {
  await clickSpine(page, page.locator('[data-seat] [data-spine]').first());
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
  /*
    §W.22: the pan resolves back to the rest view — the reader's OWN position
    when they pulled, not the arrival. A latch meant to stop the arrival's
    write being mistaken for a reader's scroll stayed armed when that write
    landed on an already-correct position, and swallowed the reader's next
    genuine scroll: the tracked view stayed at the arrival, the pull started
    from there, and put back returned there. Measured: 593 scrolled, 75
    returned.
  */
  expect(await region.evaluate((el) => el.scrollTop), 'the region is back at rest').toBe(before);
});

test('the body is not left locked after the record returns', async ({ page }) => {
  /* Where the pulled state exists: below §W.24's fork a tap opens the record screen instead. */
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });

  await pullASpine(page);
  await page.getByRole('button', { name: 'Put back' }).click();
  await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  await page.waitForTimeout(1200);

  const position = await page.evaluate(() => document.body.style.position);
  expect(position, 'the body is not left fixed').not.toBe('fixed');
});

/**
 * **§W.29: the person's scroll wins.** "Once they have scrolled the region,
 * the arrival is not applied. That holds whether the scroll came before the
 * page was interactive or after." The first test above is the intermittent
 * one that found the hole: its scroll landed between the first paint and
 * the commit that wrote the arrival, and the write overwrote it (593
 * scrolled, 75 read). The two cases below stage a scroll on purpose, and
 * each confirms its staged scroll TOOK before anything is read, so a pass
 * cannot be a scroll that never happened. "Where the person put it" is
 * measured as what is on screen — the first spine's offset from the
 * region's top — because the server paints the composition translated to
 * the arrival with the region's scroll at zero, so the scroll figure itself
 * legitimately changes when the offset is cleared; the content under the
 * person's eye must not. The staged scroll is 300, within the range that
 * survives the clearing: at the scroller's end the content the offset showed
 * does not exist below the composition, and the clamp moves it.
 *
 * An init script runs before the document has a root, so the observer
 * watches the document node itself; observing `documentElement` threw and
 * staged nothing, which the precondition reported (15 Oct).
 */
type Staged = { top: number; hydrated: boolean; arrival: string | null; spineTop: number | null } | null;
type Probe = Window & { __staged?: Staged; __arrival?: string };

const readAfterArrival = (page: Page) =>
  page.evaluate(() => {
    const w = window as unknown as Probe;
    const el = document.querySelector<HTMLElement>('[data-region="wall"]');
    const spine = document.querySelector('[data-seat] [data-spine]');
    return {
      staged: w.__staged ?? null,
      arrival: w.__arrival ?? null,
      scrollTop: el === null ? null : Math.round(el.scrollTop),
      spineTop: el === null || spine === null ? null : Math.round(spine.getBoundingClientRect().top - el.getBoundingClientRect().top),
    };
  });

test('a scroll before the page is interactive wins over the arrival (§W.29)', async ({ page }) => {
  /* Script chunks held back, so the parser has painted the wall and the person has had time to scroll before anything hydrates. */
  await page.route('**/_next/static/**/*.js', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1500));
    await route.continue();
  });
  await page.addInitScript(() => {
    const w = window as unknown as Probe;
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>('[data-region="wall"]');
      if (el === null) return;
      el.scrollTop = 300;
      if (el.scrollTop > 100) {
        const spine = document.querySelector('[data-seat] [data-spine]');
        w.__staged = { top: el.scrollTop, hydrated: el.dataset.hydrated === 'true', arrival: w.__arrival ?? null, spineTop: spine === null ? null : Math.round(spine.getBoundingClientRect().top - el.getBoundingClientRect().top) };
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as Probe).__arrival !== undefined, null, { timeout: 30_000 });
  const read = await readAfterArrival(page);
  expect(read.staged, 'the staged scroll took').not.toBeNull();
  expect(read.staged?.top ?? 0, 'the region was scrolled before hydration').toBeGreaterThan(100);
  expect(read.staged?.hydrated, 'and it took BEFORE the page was interactive').toBe(false);
  expect(read.arrival, 'the arrival was not applied').toBe('skipped');
  expect(Math.abs((read.spineTop ?? 0) - (read.staged?.spineTop ?? 0)), 'the wall is where the person put it').toBeLessThanOrEqual(2);
});

/**
 * The "after" case, as staged on 15 Oct: a scroll that waits for the
 * region's hydration mark lands AFTER the arrival has been decided, every
 * time, because the measuring commit re-renders synchronously and the mark,
 * the measurement and the arrival's write are one task — a person cannot
 * scroll inside it. So what the ruling's "or after" reaches in practice is a
 * consumption deferred past that task, which the same check covers: the
 * region's scroll is read against the first-painted zero at the commit that
 * consumes. This test records the measured fact and holds the other half of
 * the ruling: once the person has scrolled, the arrival is applied once and
 * nothing later writes over them — here, the commit a measurement tick
 * forces. Fails against the listener's reading of the person's scroll into
 * the tracked view (`onScroll` in WallLive), which that commit restores.
 */
test('a scroll after hydration stands: the arrival is applied once, and a later commit does not write over the person (§W.29)', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as Probe;
    const observer = new MutationObserver(() => {
      const el = document.querySelector<HTMLElement>('[data-region="wall"]');
      if (el === null || el.dataset.hydrated !== 'true' || w.__staged) return;
      el.scrollTop = 300;
      if (el.scrollTop > 100) {
        const spine = document.querySelector('[data-seat] [data-spine]');
        w.__staged = { top: el.scrollTop, hydrated: true, arrival: w.__arrival ?? null, spineTop: spine === null ? null : Math.round(spine.getBoundingClientRect().top - el.getBoundingClientRect().top) };
        observer.disconnect();
      }
    });
    observer.observe(document, { childList: true, subtree: true, attributes: true, attributeFilter: ['data-hydrated'] });
  });
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as Probe).__staged !== undefined, null, { timeout: 30_000 });
  const staged = await readAfterArrival(page);
  expect(staged.staged?.top ?? 0, 'the region was scrolled once hydrated').toBeGreaterThan(100);
  expect(staged.staged?.arrival, 'the arrival had already been decided when the scroll landed: the window is one task').toBe('applied');
  /* A commit forced after the scroll: the measurement tick re-lays the frame and writes the tracked view back. */
  await page.setViewportSize({ width: 1279, height: 720 });
  await page.waitForTimeout(400);
  const read = await readAfterArrival(page);
  expect(read.arrival, 'applied once, not again').toBe('applied');
  expect(Math.abs((read.spineTop ?? 0) - (staged.staged?.spineTop ?? 0)), 'the wall is where the person put it').toBeLessThanOrEqual(2);
});
