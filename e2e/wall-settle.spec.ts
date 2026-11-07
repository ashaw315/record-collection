import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';
import { login } from './sign-in';
import { landingWrite, markDocument, settled, type DocumentMark } from './wall-settle';

registerCleanup();

/**
 * **The landing wait holds on the thing, and names what else it finds (Q45,
 * 6 Nov).** `settled()` is shared by twelve call sites (seven in Q45's
 * enumeration, by inspection; eleven by a grep for `settled(page`; the
 * twelfth, `settled(fresh`, by the compiler once the document became required). Until 6 Nov it held on the landing's count, the region's
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

/* The zoom-in's landing, with the mark taken before the run's click: the document every wait after it is in. */
async function zoomInLanding(page: Page): Promise<DocumentMark> {
  const artistId = await seed(page, 240);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __landings?: number }).__landings = 0; });
  const zoomed = await markDocument(page);
  await page.locator('[data-run]').first().click();
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible();
  return zoomed;
}

/*
  Until 6 Nov (second ruling) this asserted the region's scroll EQUAL to the write: the equality is a read of the
  view across the window the collection moves in, and it flaked twice with the same frames (runs 42292989122 and
  42309967002: content 1267 at the write, 1179 at this read, 240 seats both, the scroll 395 then 307, which are the
  scroller's limits at each frame, 1267 − 872 and 1179 − 872). What the page owns at one read: the write for that
  count, and the scroll within the scroller's limit now.
*/
test('after a zoom-in landing the wait resolves on the landing’s own write for that count, the region within its limit at the read', async ({ page }) => {
  const zoomed = await zoomInLanding(page);
  const settledAt = await settled(page, 1, { same: zoomed });
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

/*
  **The wait states which document it is waiting in (the coordinator, 7 Nov), both arms staged.** The wait reads
  the window's landing count and write, which a new document starts afresh, so before this it caught neither:
  (1) a document replaced under a same-document wait, staged on 7 Nov by aborting the zoom's RSC fetch, when Next
  loaded the `?shelf=` URL whole and the new page's own landing satisfied the wait; (2) a navigating wait returning
  on the page it was leaving, whose landing had already been counted, before the navigation committed. Fails
  against a wait with no document option, and against either arm removed.
*/
test('same: a document replaced between the mark and the landing fails the wait by name', async ({ page }) => {
  const artistId = await seed(page, 240);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await page.getByTestId('wall-zoom-out').click();
  await expect(page.locator('[data-wall="overview"]')).toBeVisible();
  await page.route(/_rsc=/, (r) => r.abort());
  const mark = await markDocument(page);
  await page.locator('[data-run]').first().click();
  await expect(settled(page, 1, { same: mark })).rejects.toThrow(/the document was replaced between the mark and the landing/);
});

/* The rail's search submits as a navigation, a new document (wall-arrival-104, 5 Nov): the arm's own case. */
async function searchFromWall(page: Page, delayMs: number): Promise<{ mark: DocumentMark; word: string }> {
  const artist = await page.request.post('/api/artists', { data: { name: `Settlenav${Date.now()}` } });
  const { id, name } = (await artist.json()) as { id: string; name: string };
  trackArtist(id);
  await seedRecords(id, 'Settlenav', suffix(), 3);
  /* Marked BEFORE the goto it waits across: marked after, the arm waits for a navigation that already happened, and failed so (7 Nov). */
  const loaded = await markDocument(page);
  await page.goto(`/?artistId=${id}`);
  await expect(page.locator('[data-wall="labelled"]')).toBeVisible({ timeout: 30_000 });
  await settled(page, 1, { after: loaded });
  await page.route((url) => url.searchParams.get('q') === name, async (route) => {
    if (route.request().isNavigationRequest()) await new Promise((ok) => setTimeout(ok, delayMs));
    await route.continue().catch(() => undefined);
  });
  const mark = await markDocument(page);
  await page.locator('#rail-search').fill(name);
  /*
    Submitted from inside the page, not by `press('Enter')`: Playwright's press waits for the navigation it starts
    to commit, so a staging through it never has the old page left to read (the first form of this test passed
    against a wait with no `after` arm, found by running it against one). A navigation Playwright does not wait on
    is the class: started by the page, by a redirect, or by an action whose navigation began after it returned.
  */
  await page.evaluate(() => (document.querySelector('#rail-search') as HTMLInputElement | null)?.form?.requestSubmit());
  return { mark, word: name };
}

test('after: a navigating wait holds until the navigation commits, and returns on the new page, not the one it left', async ({ page }) => {
  const { mark, word } = await searchFromWall(page, 3000);
  await settled(page, 1, { after: mark });
  expect(await page.evaluate(() => new URLSearchParams(location.search).get('q')), 'the wait returned on the searched page; the page it left had already landed, and carries no q').toBe(word);
});

test('after: a navigation that has not committed within the wait fails it by name, not on the page it was leaving', async ({ page }) => {
  test.setTimeout(60_000);
  const { mark } = await searchFromWall(page, 25_000);
  await expect(settled(page, 1, { after: mark })).rejects.toThrow(/the navigation has not committed: the document is still the one marked before the action/);
});

test('a view moved after the landing is named by the wait as a diagnostic, with both frames, and the wait resolves', async ({ page }) => {
  const zoomed = await zoomInLanding(page);
  await settled(page, 1, { same: zoomed });
  await page.evaluate(() => { const el = document.querySelector('[data-region="wall"]') as HTMLElement; el.scrollTop += 240; });
  /*
    Named with both frames, the write's and the read's, so a clamp can be told from a widening and a changed
    collection from either; named and not failed, since the only mover the product does not already guarantee
    against is the scroller's clamp when the collection changes the wall's extent, which is not a defect.
  */
  const frames = /not the landing’s write \(\d+, \d+\) for landing 1: at the write content \d+, region \d+, seats \d+; at this read content \d+, region \d+, seats \d+/;
  const settledAt = await settled(page, 1, { same: zoomed });
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
