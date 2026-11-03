import { expect, test, type Page, type Route } from '@playwright/test';
import sharp from 'sharp';
import { OUT_MS } from '../src/app/wall/gesture';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';
import { registerCleanup, trackArtist } from './cleanup';
import { near, pixelAt } from './pixel-read';
import { seedImage } from './seed';
import { login } from './sign-in';
import { clickSpine, wallAtRest } from './wall-ready';

/**
 * **Step 164, §W.8: when the wall fetches covers, and a pull before its cover
 * arrives.**
 *
 * "The wall fetches its covers after it has hydrated, at low priority, and
 * fetches a pulled record's cover at once if it has not arrived." And: "A
 * pull does not wait for its cover: a record whose cover has not arrived
 * lands on its sleeve's field in the record's colour, with no type on it,
 * and the cover takes its place when it arrives" — in one frame, with no
 * fade.
 *
 * Covers are served over http from the app's own origin, routed here: a
 * data: URL makes no request, and these tests are about requests. The
 * first test runs on the real page, because the thing it guards against is
 * the page's: the Collection grid rendered under the wall at `display:
 * none` fetched its covers at parse time, 13 of a cold load's 19.7 seconds
 * at fast 3G on production (NOTES, 30 Oct). The hydration moment is read by
 * a wrapper installed before the page's scripts, on the mark `WallLive`
 * sets; it is a time on the page's own clock, as Resource Timing's are.
 */
registerCleanup();

const COVER = (name: string) => `/e2e-covers/164-${name}.png`;

const solid = (r: number, g: number, b: number) =>
  sharp({ create: { width: 8, height: 8, channels: 3, background: { r, g, b } } }).png().toBuffer();

const RED = [200, 30, 30] as const;

async function seedTwoWithCovers(page: Page, stamp: string): Promise<void> {
  const artist = await page.request.post('/api/artists', { data: { name: `Covers164-${stamp}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  for (const name of ['a', 'b']) {
    const r = await page.request.post('/api/records', { data: { title: `Covers164 ${name} ${stamp}`, artistId } });
    const { id } = (await r.json()) as { id: string };
    await seedImage({ recordId: id, imageType: 'cover', url: COVER(`${name}-${stamp}`) });
  }
}

/*
  The moment the wall's container is marked hydrated, on the page's clock;
  null if it never was. Taken synchronously, in the set itself: a
  MutationObserver reports after React's whole effect flush, and the fetch is
  made inside that flush, so the observer's time came 38ms AFTER a request
  the ruling allows. A parse-time fetch from the hidden grid is hundreds of
  milliseconds before either.
*/
const HYDRATION_MARK = `
  window.__wallHydratedAt = null;
  const set = Element.prototype.setAttribute;
  Element.prototype.setAttribute = function (name, value) {
    if (name === 'data-hydrated' && value === 'true' && this.hasAttribute('data-wall-container') && window.__wallHydratedAt === null) window.__wallHydratedAt = performance.now();
    return set.call(this, name, value);
  };
`;

test('the wall requests no cover before it hydrates, and every seat’s after it, at low priority', async ({ page, context }) => {
  const stamp = Date.now().toString(36);
  await login(page);
  await seedTwoWithCovers(page, stamp);
  const png = await solid(...RED);
  await page.route('**/e2e-covers/*.png', (route) => route.fulfill({ contentType: 'image/png', body: png }));
  /* The priority each request was made at, from the browser's own loader. */
  const priorities = new Map<string, string>();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  cdp.on('Network.requestWillBeSent', (e) => { if (e.request.url.includes('/e2e-covers/')) priorities.set(new URL(e.request.url).pathname, e.request.initialPriority); });
  await page.addInitScript(HYDRATION_MARK);

  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/');
  await wallAtRest(page);

  const entries = () => page.evaluate(() =>
    performance.getEntriesByType('resource').filter((e) => e.name.includes('/e2e-covers/')).map((e) => ({ path: new URL(e.name).pathname, startTime: e.startTime })),
  );
  /* Both seeded covers are fetched by the wall itself, once hydrated. */
  await expect.poll(entries, { timeout: 15_000 }).toHaveLength(2);
  const hydratedAt = await page.evaluate(() => (window as unknown as { __wallHydratedAt: number | null }).__wallHydratedAt);
  expect(hydratedAt, 'the wall was marked hydrated').not.toBeNull();
  const got = await entries();
  expect(got.map((e) => e.path).sort()).toEqual([COVER(`a-${stamp}`), COVER(`b-${stamp}`)]);
  for (const e of got) expect(e.startTime, `${e.path} requested after hydration`).toBeGreaterThanOrEqual(hydratedAt ?? Infinity);
  /* "Low" is also what Chromium gives an image outside the viewport on its own; the attribute the code sets is asserted in prefetch-covers.test.ts. */
  expect([...priorities.values()], 'every cover at low priority').toEqual(['Low', 'Low']);
});

test('a pull before its cover arrives lands on the field in the record’s colour with no type, and the cover takes its place when it arrives, without a fade', async ({ page }) => {
  const stamp = Date.now().toString(36);
  const png = await solid(...RED);
  /* The cover's response is held until the test releases it: one request, in flight across the pull. */
  const held: Route[] = [];
  let requests = 0;
  await page.route(`**${COVER(`slow-${stamp}`)}`, (route) => { requests += 1; held.push(route); });

  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  await page.goto(`/wall/probe/labelled?cover=${encodeURIComponent(COVER(`slow-${stamp}`))}`);
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  await wallAtRest(page);
  /* The wall asked for it ahead of any pull. */
  await expect.poll(() => requests, { timeout: 15_000 }).toBe(1);
  await page.clock.pauseAt(Date.now() + 1000);

  const wired = `collection-${COLLECTION_SPINES.findIndex((row) => row.title === 'Wired')}`;
  await clickSpine(page, page.locator(`[data-seat="${wired}"] [data-spine]`));
  await page.clock.runFor(OUT_MS + 40);

  const pulled = page.locator('[data-pulled]');
  await expect(pulled.locator('[data-no-cover]'), 'no type on the field: this is not the no-cover case').toHaveCount(0);
  const image = pulled.locator('image[data-cover]');
  await expect(image).toHaveAttribute('href', COVER(`slow-${stamp}`));
  expect(requests, 'the pull joined the request in flight; it did not start a second').toBe(1);

  /* The field's colour, as painted, at the field's centre. */
  const centre = await pulled.locator('[data-field]').evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const fieldRgb = await pulled.locator('[data-field]').evaluate((el) => {
    const k = document.createElement('canvas'); k.width = 1; k.height = 1;
    const x = k.getContext('2d') as CanvasRenderingContext2D;
    x.fillStyle = el.getAttribute('fill') ?? ''; x.fillRect(0, 0, 1, 1);
    return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
  const pending = await pixelAt(page, centre.x, centre.y);
  expect(near(pending, fieldRgb), `the field in the record's colour ${fieldRgb} while the cover is in flight, painted ${pending}`).toBe(true);
  expect(near(pending, [...RED]), 'and not the cover').toBe(false);

  /* No fade: the image carries no transition, and is at full opacity when the cover arrives. */
  await expect(image).toHaveAttribute('opacity', '1');
  expect(await image.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s');

  for (const route of held) await route.fulfill({ contentType: 'image/png', body: png });
  await expect.poll(async () => near(await pixelAt(page, centre.x, centre.y), [...RED]), { timeout: 10_000 }).toBe(true);
});
