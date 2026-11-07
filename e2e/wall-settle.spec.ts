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

const region = (page: Page) =>
  page.evaluate(() => {
    const el = document.querySelector('[data-region="wall"]') as HTMLElement;
    return { left: Math.round(el.scrollLeft), top: Math.round(el.scrollTop), limitX: el.scrollWidth - el.clientWidth, limitY: el.scrollHeight - el.clientHeight };
  });

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

/*
  Until 6 Nov (second ruling) this asserted the region's scroll EQUAL to the write: the equality is a read of the
  view across the window the collection moves in, and it flaked twice with the same frames (runs 42292989122 and
  42309967002: content 1267 at the write, 1179 at this read, 240 seats both, the scroll 395 then 307, which are the
  scroller's limits at each frame, 1267 − 872 and 1179 − 872). What the page owns at one read: the write for that
  count, and the scroll within the scroller's limit now.
*/
test('after a zoom-in landing the wait resolves on the landing’s own write for that count, the region within its limit at the read', async ({ page }) => {
  await zoomInLanding(page);
  const settledAt = await settled(page, 1);
  const write = await landingWrite(page);
  expect(write, 'the product recorded the landing it wrote').not.toBeNull();
  expect(write?.landings, 'for landing 1').toBe(1);
  expect(settledAt.write, 'and the wait returned that write').toEqual(write);
  const now = await region(page);
  expect(now.left).toBeGreaterThanOrEqual(0);
  expect(now.left).toBeLessThanOrEqual(now.limitX);
  expect(now.top).toBeGreaterThanOrEqual(0);
  expect(now.top).toBeLessThanOrEqual(now.limitY);
});

test('a view moved after the landing is named by the wait as a diagnostic, with both frames, and the wait resolves', async ({ page }) => {
  await zoomInLanding(page);
  await settled(page, 1);
  await page.evaluate(() => { const el = document.querySelector('[data-region="wall"]') as HTMLElement; el.scrollTop += 240; });
  /*
    Named with both frames, the write's and the read's, so a clamp can be told from a widening and a changed
    collection from either; named and not failed, since the only mover the product does not already guarantee
    against is the scroller's clamp when the collection changes the wall's extent, which is not a defect.
  */
  const frames = /not the landing’s write \(\d+, \d+\) for landing 1: at the write content \d+, region \d+, seats \d+; at this read content \d+, region \d+, seats \d+/;
  const settledAt = await settled(page, 1);
  expect(settledAt.moved, 'the wait says the view moved, with both frames').toMatch(frames);
  /*
    The annotation for THIS call is the last one, and not the only one: the first wait above can name the
    collection's re-clamp too, which run 42324913034 did with the same frames as 42292989122 and 42309967002
    (content 1267 then 1179, the scroll 395 then 307). "Exactly one" read the shared quantity again.
  */
  const noted = test.info().annotations.filter((a) => a.type === 'landing-moved');
  expect(noted.length, 'the run carries it as an annotation the report shows').toBeGreaterThanOrEqual(1);
  expect(noted.at(-1)?.description, 'and the last is this call’s').toBe(settledAt.moved);
});
