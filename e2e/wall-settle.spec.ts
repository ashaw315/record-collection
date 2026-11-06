import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';
import { login } from './sign-in';
import { landingWrite, settled } from './wall-settle';

registerCleanup();

/**
 * **The landing wait holds on the thing, and names what else it finds (Q45,
 * 6 Nov).** `settled()` is shared by seven call sites in wall-route and
 * wall-arrival-104. Until 6 Nov it held on the landing's count, the region's
 * mark, and three quiet animation frames of scroll and extent; on run
 * 42243942847 it returned on a landing whose geometry was a row off (:162)
 * and on a wall that no longer fit (:213), and nothing in it could say
 * which. The count and the mark say the landing was consumed; the thing the
 * callers want is the view the landing WROTE, which the product records
 * (`landingWriteRef`, now also `window.__landingWrite`) and nothing read.
 * So the wait now also holds that the region's scroll is that write, and
 * when it is not, fails naming both, so the next failure says whether the
 * write itself was wrong or something moved the view after it.
 *
 * Fails against: a wait that resolves on the count and quiet frames alone
 * (the second test, where the view is moved after the landing and the old
 * wait resolved); a product that records no write (the first, where the
 * write is read and compared).
 */
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function seed(page: Page, count: number): Promise<string> {
  const artist = await page.request.post('/api/artists', { data: { name: `Settle-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  await seedRecords(artistId, 'Settle', suffix(), count);
  return artistId;
}

const region = (page: Page) => page.evaluate(() => { const el = document.querySelector('[data-region="wall"]') as HTMLElement; return { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop) }; });

test.beforeEach(async ({ page }) => { await login(page); await page.setViewportSize({ width: 1440, height: 900 }); });

async function zoomInLanding(page: Page): Promise<void> {
  const artistId = await seed(page, 240);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __landings?: number }).__landings = 0; });
  await page.locator('[data-run]').first().click();
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
}

test('after a zoom-in landing the wait resolves with the region’s scroll at the landing’s own write', async ({ page }) => {
  await zoomInLanding(page);
  await settled(page, 1);
  const write = await landingWrite(page);
  expect(write, 'the product recorded the landing it wrote').not.toBeNull();
  expect(await region(page), 'and the region is there').toEqual({ left: write?.left, top: write?.top });
});

test('a view moved after the landing is named by the wait rather than passed: the scroll is not the write', async ({ page }) => {
  await zoomInLanding(page);
  await settled(page, 1);
  await page.evaluate(() => { const el = document.querySelector('[data-region="wall"]') as HTMLElement; el.scrollTop += 240; });
  await expect(settled(page, 1)).rejects.toThrow(/not the landing’s write/);
});
