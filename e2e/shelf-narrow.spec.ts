import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { isFarView, nearViewMinWidth } from '../src/app/wall/view-fork';

registerCleanup();

/**
 * 8a §11.24: the narrow shelf is the far view — measured rather than chosen.
 *
 * At 390px the near view holds about two seats, and two of two hundred is
 * not a fixture; the far view has no width floor because its labels are
 * absent rather than shrunk. Two consequences, both asserted here: a tap goes
 * to the record screen rather than to a pulled state (the landing needs a
 * 560 cover and a 420 panel side by side), and the rail collapses to one
 * band. This spec runs on the MOBILE project — the finding §11.24 keeps is
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
  const count = await box(page, '[data-testid="wall-count"]');
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
  /* Nothing overflows the width: the page does not scroll sideways. */
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);

  /* A tap goes to the record screen; nothing is pulled. */
  await page.locator(`[data-wall="overview"] a[data-seat="${recordId}"]`).click();
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
