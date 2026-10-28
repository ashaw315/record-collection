import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { seedRecords, removeRecordsFor } from './seed';
import { login } from './sign-in';
import { clickSpine } from './wall-ready';

/**
 * **§T.6, 14 Oct: the spines are one Tab stop with a roving index.** "The
 * arrow keys move focus seat to seat in §W.23's order and do nothing else,
 * Enter pulls the focused record, and the pull moves by the panel's buttons
 * and §W.9's arrows. One key does one job." The ring step's bullet names
 * the tests: that search is reached before any spine, that one Tab leaves
 * the wall, and that an arrow with a record pulled moves focus and not the
 * pull. On the seventeen of the test database, at the wall sheet's window.
 */
const WALL = { width: 1440, height: 900 };

async function openShelf(page: Page) {
  await page.setViewportSize(WALL);
  await page.goto('/');
  await page.locator('[data-shelf-offered] [data-wall="labelled"]').waitFor({ timeout: 30_000 });
  await page.waitForLoadState('networkidle').catch(() => {});
}

const active = (page: Page) =>
  page.evaluate(() => ({
    id: document.activeElement?.id ?? '',
    seat: document.activeElement?.getAttribute('data-seat') ?? null,
    tag: document.activeElement?.tagName.toLowerCase() ?? '',
  }));

/*
  More than one row, on purpose (the gate at afc87d1, 16 Oct). On the
  seventeen alone the wall is one row and the anchors' DOM order is §W.23's
  seat order; under the full suite other specs' records gave it a second
  row, and "Paint order interleaves rows by column" (WallLabelled), so the
  DOM's first anchor was not the first seat and ArrowLeft from it had
  somewhere to go. Sixty records of this spec's own make the second row
  every run, so the reading below is exercised where it was wrong.
*/
let artistId: string;

test.beforeEach(async ({ page }) => {
  const db = getTestDb();
  const rows = await db.execute(sql`INSERT INTO artists (name) VALUES ('Roving Probe') RETURNING id`);
  artistId = (rows.rows[0] as { id: string }).id;
  await seedRecords(artistId, 'Rove', 'probe', 60);
  await login(page);
});

test.afterEach(async () => {
  const db = getTestDb();
  await removeRecordsFor(artistId);
  await db.execute(sql`DELETE FROM artists WHERE id = ${artistId}::uuid`);
});

test('the spines are one Tab stop: search is reached before any spine, the stop is the roving seat, and one Tab leaves the wall', async ({ page }) => {
  await openShelf(page);
  const stops = await page.evaluate(() => Array.from(document.querySelectorAll('a[data-seat]')).map((a) => a.getAttribute('tabindex')));
  expect(stops.length, 'the seventeen and this spec’s sixty are seated').toBeGreaterThanOrEqual(77);
  expect(await page.evaluate(() => new Set(Array.from(document.querySelectorAll('a[data-seat]')).map((a) => Math.round(a.getBoundingClientRect().top))).size), 'the precondition: more than one row').toBeGreaterThan(1);
  expect(stops.filter((t) => t === '0'), 'exactly one spine is in the tab order').toHaveLength(1);
  expect(stops.filter((t) => t === '-1'), 'and every other spine is reachable only by the arrows').toHaveLength(stops.length - 1);

  /* Tab from the document's start until a spine holds focus, recording what came before it. */
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const before: string[] = [];
  let at = await active(page);
  for (let i = 0; i < 60 && at.seat === null; i += 1) {
    await page.keyboard.press('Tab');
    at = await active(page);
    if (at.seat === null) before.push(at.id || at.tag);
  }
  expect(at.seat, 'a spine is reached by Tab').not.toBeNull();
  expect(before, 'the search field came before it').toContain('rail-search');
  expect(await page.evaluate(() => document.activeElement?.getAttribute('tabindex')), 'the stop is the roving seat').toBe('0');

  await page.keyboard.press('Tab');
  expect((await active(page)).seat, 'one Tab leaves the wall').toBeNull();
});

test('the arrow keys move focus seat to seat and do nothing else; Enter pulls the focused record', async ({ page }) => {
  await openShelf(page);
  /* §W.23's order is the anchors' seat order, not their DOM order: read by `data-seat-order`, the channel step 148 added for exactly this. */
  const seats = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('a[data-seat][data-seat-order]')).sort((a, b) => Number(a.dataset.seatOrder) - Number(b.dataset.seatOrder)).map((a) => a.getAttribute('data-seat')));
  await page.locator(`a[data-seat="${seats[0]}"]`).focus();
  await page.keyboard.press('ArrowRight');
  expect((await active(page)).seat, 'ArrowRight: the next seat').toBe(seats[1]);
  await page.keyboard.press('ArrowRight');
  expect((await active(page)).seat).toBe(seats[2]);
  await page.keyboard.press('ArrowLeft');
  expect((await active(page)).seat, 'ArrowLeft: the previous seat').toBe(seats[1]);
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  expect((await active(page)).seat, 'the first seat has no previous: focus stays').toBe(seats[0]);
  expect(await page.getByTestId('record-chrome').count(), 'the arrows pulled nothing').toBe(0);
  expect(await page.evaluate(() => document.querySelectorAll('a[data-seat][tabindex="0"]').length), 'the roving stop moved with focus: still exactly one').toBe(1);
  expect(await page.evaluate(() => document.querySelector('a[data-seat][tabindex="0"]')?.getAttribute('data-seat')), 'and it is the focused seat').toBe(seats[0]);

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('record-chrome'), 'Enter pulls the focused record').toBeVisible({ timeout: 5000 });
  await expect(page.locator('[data-pulled]')).toHaveAttribute('data-pulled', seats[1] ?? '', { timeout: 5000 });
});

test('an arrow with a record pulled moves focus and not the pull', async ({ page }) => {
  await openShelf(page);
  /* §W.23's order is the anchors' seat order, not their DOM order: read by `data-seat-order`, the channel step 148 added for exactly this. */
  const seats = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('a[data-seat][data-seat-order]')).sort((a, b) => Number(a.dataset.seatOrder) - Number(b.dataset.seatOrder)).map((a) => a.getAttribute('data-seat')));
  await clickSpine(page, page.locator(`a[data-seat="${seats[0]}"] [data-spine]`));
  await page.getByTestId('record-chrome').waitFor({ timeout: 5000 });
  await page.locator('[data-pulled]').waitFor({ timeout: 5000 });
  /* Settled: §W.9's arrows are drawn once the record has landed. */
  await page.locator('[data-testid="nav-next"], [data-testid="nav-previous"]').first().waitFor({ timeout: 10_000 });
  const pulledBefore = await page.locator('[data-pulled]').getAttribute('data-pulled');
  expect(pulledBefore).toBe(seats[0]);

  /* A standing spine: the pulled record has left the seat list, so the first anchor is the second record. */
  await page.locator(`a[data-seat="${seats[1]}"]`).focus();
  await page.keyboard.press('ArrowRight');
  expect((await active(page)).seat, 'focus moved to the next standing seat').toBe(seats[2]);
  await page.waitForTimeout(900);
  expect(await page.locator('[data-pulled]').getAttribute('data-pulled'), 'the pull did not move').toBe(pulledBefore);
  expect(await page.locator('[data-pulled]').count(), 'and nothing else came out').toBe(1);
});
