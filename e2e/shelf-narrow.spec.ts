import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { isFarView, nearViewMinWidth } from '../src/app/wall/view-fork';

registerCleanup();

/**
 * 8a §W.24: the narrow shelf is the far view — measured rather than chosen.
 *
 * At 390px the near view holds about two seats, and two of two hundred is
 * not a fixture; the far view has no width floor because its labels are
 * absent rather than shrunk. Two consequences, both asserted here: a tap goes
 * to the record screen rather than to a pulled state (the landing needs a
 * 560 cover and a 420 panel side by side), and the rail collapses to one
 * band. This spec runs on the MOBILE project — the finding §W.24 keeps is
 * that no mobile project ran the shelf specs, so the view had no narrow form
 * and nothing asserted that it did.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const box = (page: Page, selector: string) =>
  page.evaluate((q) => {
    const r = document.querySelector(q)?.getBoundingClientRect();
    return r ? { top: r.top, bottom: r.bottom, left: r.left, width: r.width, height: r.height } : null;
  }, selector);

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('at 390px the shelf is the far view in one column, the rail one band, and a tap opens the record', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(isFarView(390)).toBe(true);
  const artist = await page.request.post('/api/artists', { data: { name: `Narrow-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  const record = await page.request.post('/api/records', { data: { title: 'Wired', artistId } });
  expect(record.status()).toBe(201);
  const recordId = (await record.json()).id as string;

  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await expect(page.locator('[data-wall="labelled"]')).toHaveCount(0);
  await expect(page.locator('[data-region="facts"]')).toHaveCount(0);

  /* The rail is one band: full width, under the nav, above the count; the filter lines and the rule withdrawn. */
  const nav = await box(page, '[data-app-nav]');
  const rail = await box(page, '[data-testid="wall-rail"]');
  const count = await box(page, '[data-testid="wall-count-far"]');
  expect(nav && rail && count).toBeTruthy();
  if (!nav || !rail || !count) return;
  expect(rail.width, 'the band spans the viewport').toBeGreaterThan(300);
  expect(rail.height, 'one band, not a column').toBeLessThan(160);
  expect(Math.abs(rail.top - nav.bottom)).toBeLessThan(2);
  expect(count.top).toBeGreaterThanOrEqual(rail.bottom);
  const railEl = page.getByTestId('wall-rail');
  await expect(railEl.getByLabel('Search')).toBeVisible();
  await expect(railEl.getByRole('link', { name: 'Shelf' })).toBeVisible();
  await expect(railEl.getByRole('link', { name: 'Add record' })).toBeVisible();
  await expect(railEl.getByLabel('Sort')).toBeHidden();
  await expect(railEl.locator('[data-rail-rule]')).toBeHidden();
  /* §W.26: Add record is a row item in the band — on the same line as the views, not wrapped under them. */
  const shelfLink = await railEl.getByRole('link', { name: 'Shelf' }).boundingBox();
  const addLink = await railEl.getByRole('link', { name: 'Add record' }).boundingBox();
  expect(shelfLink && addLink).toBeTruthy();
  if (shelfLink && addLink) {
    /* To the right of the views and overlapping them vertically: the same row, not the line under it. */
    expect(addLink.x, 'to the right').toBeGreaterThan(shelfLink.x + shelfLink.width);
    expect(addLink.y, 'one row').toBeLessThan(shelfLink.y + shelfLink.height);
    expect(addLink.y + addLink.height, 'one row').toBeGreaterThan(shelfLink.y);
  }
  /* Nothing overflows the width: the page does not scroll sideways. */
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  /* A tap goes to the record screen; nothing is pulled. */
  /*
    **Tapped where the seat is drawn, not at the middle of its box.** In the
    overview a spine is a slanted sliver of its bounding box; the rest of the
    box belongs to its neighbours and to the shelf's uprights. A tap at the
    box's centre landed on this seat or not according to where the record
    fell on the wall, which depends on how many other records there are:
    among the seventeen alone it fell beside an upright, 30 of 49 sampled
    points of its box were the upright's, and the tap never arrived (6 Oct).
    It passed in full runs on what other specs had left on the wall. So the
    point is found by asking the page which point of the box is the seat's
    own, and the test says so if there is none.
  */
  const seat = page.locator(`[data-wall="overview"] a[data-far-seat="${recordId}"]`);
  const own = await seat.evaluate((el) => {
    const r = el.getBoundingClientRect();
    for (let i = 1; i < 16; i += 1) for (let j = 1; j < 16; j += 1) {
      const x = r.left + (r.width * i) / 16; const y = r.top + (r.height * j) / 16;
      const hit = document.elementFromPoint(x, y);
      if (hit !== null && el.contains(hit)) return { x, y };
    }
    return null;
  });
  expect(own, 'some point of the seat’s box is the seat’s own to tap').not.toBeNull();
  if (own === null) return;
  await page.mouse.click(own.x, own.y);
  await expect(page).toHaveURL(new RegExp(`/records/${recordId}`));
  expect(await page.locator('[data-pulled]').count()).toBe(0);
});

test('the fork is one number: widening past it brings the near view back, with the rail a column again', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();

  await page.setViewportSize({ width: nearViewMinWidth(), height: 844 });
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
  await expect(page.locator('[data-wall="overview"]')).toHaveCount(0);
  const rail = await box(page, '[data-testid="wall-rail"]');
  expect(rail?.width).toBeCloseTo(148, 0);
  await expect(page.getByTestId('wall-rail').getByLabel('Sort')).toBeVisible();

  await page.setViewportSize({ width: nearViewMinWidth() - 1, height: 844 });
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await expect(page.locator('[data-wall="labelled"]')).toHaveCount(0);
});

test('the first paint is the far view: with no script at all, 390px shows the overview and hides the labelled wall (§W.26’s flash, handled)', async ({ browser, page: signedIn }) => {
  /* The login form needs script to submit; the session cookie does not. Sign in with script, then look with none. */
  await login(signedIn);
  const context = await browser.newContext({ javaScriptEnabled: false, viewport: { width: 390, height: 844 }, storageState: await signedIn.context().storageState() });
  const page = await context.newPage();
  try {
    await page.goto('/');
    await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
    /* Both are in the document — the server has no width, and with no script none is ever measured — and the stylesheet decides. */
    await expect(page.locator('[data-wall-container][data-unmeasured]')).toBeAttached();
    await expect(page.locator('[data-region="far"]')).toBeVisible();
    await expect(page.locator('[data-region="near"]')).toBeHidden();
    await page.setViewportSize({ width: nearViewMinWidth(), height: 844 });
    await expect(page.locator('[data-region="near"]')).toBeVisible();
    await expect(page.locator('[data-region="far"]')).toBeHidden();
  } finally {
    await context.close();
  }
});
