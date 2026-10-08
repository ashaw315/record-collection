import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';
import { login } from './sign-in';

/**
 * **The access contract the lit wall met through a list, met by the spines
 * themselves (8a §W.8).** Two of the five claims inherit here — the other
 * three live in shelf.spec.ts. They were written against a list beside a
 * canvas; each is checked here for the reason it was written, not for
 * passing incidentally against anchors inside an SVG.
 */

registerCleanup();
const suffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function seed(page: Page, count: number) {
  const artist = await page.request.post('/api/artists', { data: { name: `Wall-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  const run = suffix();
  await seedRecords(artistId, 'Wall', run, count);
  const titles = Array.from({ length: count }, (_, i) => `Wall ${String(i).padStart(2, '0').slice(0, 2)} ${run}`);
  return { artistId, titles };
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('every record is a link named by its FULL title — the face carries the truncated one', async ({
  page,
}) => {
  /**
   * The reason: the drawn label is cut at 37 characters, so what is drawn may
   * name no record to a screen reader. The accessible name carries the whole
   * `Artist · Title` — §W.8's one place where truncation is not a loss.
   */
  const { artistId, titles } = await seed(page, 8);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });

  for (const title of titles) {
    await expect(page.getByRole('link', { name: new RegExp(title) }), `${title} reachable by name`).toHaveCount(1);
  }
  /* One link per record, no more: the spines ARE the links, there is no list beside them. */
  expect(await page.getByTestId('wall').locator('a[data-seat]').count()).toBe(titles.length);
  await expect(page.getByTestId('wall-records'), 'no parallel list').toHaveCount(0);
  const href = await page.getByTestId('wall').locator('a[data-seat]').first().getAttribute('href');
  expect(href).toMatch(/^\/records\/[0-9a-f-]{36}$/);
});

test('a keyboard can walk the wall and open a record', async ({ page }) => {
  /**
   * The reason: a canvas had no keyboard path at all, and the swap nearly
   * lost it. Asserted as what a user can DO: tab to a spine, see it, press
   * Enter — the record comes out — and reach the full record from the panel.
   */
  const { artistId, titles } = await seed(page, 6);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });

  let reached = false;
  for (let press = 0; press < 40 && !reached; press += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(() => document.activeElement?.closest('[data-seat]') !== null);
  }
  expect(reached, 'the wall must be reachable by keyboard at all').toBe(true);

  const focused = await page.evaluate(() => {
    const box = (document.activeElement as Element).getBoundingClientRect();
    /* An SVG <a>'s `.href` is an SVGAnimatedString; the attribute is the route. */
    return { width: box.width, height: box.height, href: document.activeElement?.getAttribute('href') ?? '' };
  });
  expect(focused.width, 'the focused record is on screen, not clipped to 1px').toBeGreaterThan(20);
  expect(focused.height).toBeGreaterThan(100);
  expect(focused.href).toMatch(/\/records\/[0-9a-f-]{36}$/);

  /* Enter pulls it; the panel arrives; its link opens the full record. */
  await page.keyboard.press('Enter');
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  const link = page.getByTestId('record-chrome').getByTestId('panel-detail-link');
  await link.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}/, { timeout: 15_000 });
  const heading = await page.getByRole('heading', { level: 1 }).first().textContent();
  expect(titles.some((t) => heading?.includes(t)), `opened "${heading}"`).toBe(true);
});
