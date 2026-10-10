import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { getTestDb } from '../test/helpers/db';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 80, §G.1: "The shared label style is tracked .10em in all four areas
 * it reaches, and the slot is tracked .12em."
 *
 * The shared style (`LABEL` in `grid-type.ts`) was a .09em literal that no
 * ruling gave, on a closed screen, and nothing asserted a tracking value
 * anywhere, which is how it survived the close. So this reads the computed
 * tracking on a rendered label in each area the style reaches -- the record
 * detail, the market panel, the collection's filters and the wall -- not the
 * class string, which would pass with the class cancelled.
 *
 * The slot's Edit and Delete record were the shared style with ink laid over
 * it. §24 calls them "the nav's own type", so they now take the header's
 * type string itself, and the test asks that every property of their type
 * equal a nav link's, not only the tracking.
 */

const TEN = '1.1px'; /* .10em of 11px */
const TWELVE = '1.32px'; /* .12em of 11px */

/** A record whose pressing names a Discogs release, so the market panel renders; set in the test database, since the API verifies a release against Discogs. */
async function seedRecordWithRelease(page: Page): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Track80-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const p = await page.request.post('/api/pressings', { data: { catalogNumber: `T80-${s}` } });
  const pressingId = ((await p.json()) as { id: string }).id;
  const r = await page.request.post('/api/records', { data: { title: `Track80 ${s}`, artistId, pressingId } });
  expect(r.status()).toBe(201);
  await getTestDb().execute(sql`UPDATE pressings SET discogs_release_id = ${8_000_000 + Math.floor(Math.random() * 900_000)} WHERE id = ${pressingId}::uuid`);
  return ((await r.json()) as { id: string }).id;
}

const trackingOf = (page: Page, selector: string) =>
  page.locator(selector).first().evaluate((el) => getComputedStyle(el).letterSpacing);

test.beforeEach(async ({ page }) => login(page));

test.describe('§G.1: the shared label style is .10em in all four areas it reaches', () => {
  /* Fails against the built .09em, which computes to 0.99px in every area. */
  test('the record detail and its market panel', async ({ page }) => {
    const id = await seedRecordWithRelease(page);
    await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
    /*
      The panel loads its market data on arrival, and its "check" control --
      the one element on this page that carries the label style inside the
      panel -- is replaced as soon as that request settles. Waiting for it
      raced the request, and lost once in a full run (5 Oct). The request is
      held open, never answered, so the control stays to be read. Nothing
      reaches Discogs: the route is intercepted before the server.
    */
    await page.route('**/api/discogs/market/**', () => { /* held: never fulfilled */ });
    await page.goto(`/records/${id}`);
    await page.locator('[data-field="images-line"]').waitFor({ timeout: 20_000 });
    expect(await trackingOf(page, '[data-field="images-line"]'), 'the record detail: the Images line').toBe(TEN);
    await page.locator('[data-testid="market-check"]').waitFor({ timeout: 20_000 });
    expect(await trackingOf(page, '[data-testid="market-check"]'), 'the market panel: its control').toBe(TEN);
  });

  /* Fails against the built .09em. */
  test('the collection’s filters and the wall’s rail', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
    await page.goto('/?view=table');
    /* By its role and not its classes: the label lost `w-12 shrink-0` at step 113's container (fff63d8), and this selector went on waiting for them. */
    await page.locator('[data-filter-label]').first().waitFor({ timeout: 20_000 });
    expect(await trackingOf(page, '[data-filter-label]'), 'the collection’s filters: a group label').toBe(TEN);
    await page.goto('/');
    await page.locator('label[for="rail-search"]').waitFor({ timeout: 30_000 });
    expect(await trackingOf(page, 'label[for="rail-search"]'), 'the wall: the rail’s SEARCH').toBe(TEN);
  });
});

test.describe('§G.1 and §24: the slot is in the nav’s own type', () => {
  /* Fails against the built slot: the shared style at .09em on a 16.5 line, where a nav link is .12em on 11. */
  test('Edit and Delete record match a nav link in face, size, line height, tracking, case and weight', async ({ page }) => {
    const id = await seedRecordWithRelease(page);
    await page.setViewportSize({ width: 1440, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-slot="actions"]').waitFor({ timeout: 20_000 });
    const m = await page.evaluate(() => {
      const type = (el: Element) => {
        const cs = getComputedStyle(el);
        return { family: cs.fontFamily, size: cs.fontSize, lineHeight: cs.lineHeight, tracking: cs.letterSpacing, transform: cs.textTransform, weight: cs.fontWeight };
      };
      const link = document.querySelector('[data-app-nav] nav[aria-label="Main"] a:not([aria-current])') as HTMLElement;
      const edit = document.querySelector('[data-slot="actions"] [data-control="edit"]') as HTMLElement;
      const del = document.querySelector('[data-slot="actions"] [data-control="delete"]') as HTMLElement;
      return { link: type(link), edit: type(edit), del: type(del) };
    });
    expect(m.edit.tracking, 'Edit is .12em').toBe(TWELVE);
    expect(m.del.tracking, 'Delete record is .12em').toBe(TWELVE);
    expect(m.edit, 'Edit is the nav’s type').toEqual(m.link);
    expect(m.del, 'Delete record is the nav’s type').toEqual(m.link);
  });
});
