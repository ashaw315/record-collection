import { readFileSync } from 'node:fs';
import { expect, test, type Page, type Route } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { registerCleanup, trackArtist } from './cleanup';
import { removeRecordsFor, seedRecords } from './seed';
import { login } from './sign-in';
import { getTestDb } from '../test/helpers/db';

/**
 * **§P.3's cover ground ("Covers fill in place", 23 Nov), at 390 on slow 3G.** "A cell whose cover hasn't painted draws
 * its title and reason at once, over a ground the cover's size in the cell's ground colour. No spinner, no partial band."
 * And the property the ground exists for, which the coordinator added as enforcement rather than extension: nothing
 * moves when the cover arrives, the title and the reason staying where they were drawn. The covers come from a host the
 * test holds and releases (the suites' own covers are data URLs, which never wait), on chromium's slow-3G throttle as
 * the step asks. Seen red against three staged faults before it was kept: the square's reserved size removed, the image
 * drawn while loading, and the square released when the cover arrives (the title and reason move with a wide cover).
 */
registerCleanup();
test.beforeEach(async ({ page }) => login(page));

/* A cover that is not square (320 × 200): a square one arriving into a square ground moves nothing even where the ground is not reserved, so it could not fail the no-shift assertion (seen 23 Nov with a 208 × 208 cover). */
const COVER = readFileSync('test/fixtures/covers/wide-320x200.png');
const HOST = 'https://covers.held.test';

test.setTimeout(120_000);

test('at 390 on slow 3G: the title and reason drawn at once over an empty ground the cover’s size, no partial cover, and nothing moves when the cover arrives', async ({ page }) => {
  const suffix = `cg${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Ground-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Ground', suffix, 2);
  const listed = (await (await page.request.get(`/api/records?artistId=${artist.id}&pageSize=10`)).json()) as { data: Array<{ id: string }> };
  const ids = listed.data.map((r) => r.id);
  const db = getTestDb();
  for (const id of ids) await db.execute(sql`INSERT INTO images (record_id, url, image_type) VALUES (${id}::uuid, ${`${HOST}/${id}.png`}, 'cover')`);
  try {
    const held: Route[] = [];
    await page.route(`${HOST}/**`, (route) => { held.push(route); });
    await page.route('**/api/ask', (route) => route.fulfill({ json: { mode: 'pick', verdict: 'answer', answers: [{ recordId: ids[0], reason: 'Slow and warm, for a grey afternoon.' }], from: 'phrase', askedFrom: null, unanswerable: false } }));
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto(`/?view=grid&artistId=${artist.id}`);
    await page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 60_000 });
    /* Slow 3G from here: it is the covers' arrival the step asks about, and the page's own load under it outruns the test. */
    const cdp = await page.context().newCDPSession(page);
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 2000, downloadThroughput: (500 * 1024) / 8 * 0.8, uploadThroughput: (500 * 1024) / 8 * 0.8 });
    const control = page.locator('[data-pick-control]').filter({ visible: true });
    await control.locator('[data-ask-field]').fill('something warm');
    await control.getByRole('button', { name: /^ask$/i }).click();
    const cell = control.locator('[data-pick-answer]').first();
    await cell.waitFor({ timeout: 30_000 });
    await expect.poll(() => held.length, { message: 'the cover was requested and is held' }).toBeGreaterThan(0);

    const read = (p: Page) => p.evaluate(`(() => {
      const cell = Array.from(document.querySelectorAll('[data-pick-control] [data-pick-answer]')).find((e) => e.getClientRects().length > 0);
      const box = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return { top: r.top, left: r.left, width: r.width, height: r.height }; };
      const img = cell.querySelector('img');
      return {
        ground: box(cell.querySelector('[data-grid-cover]')),
        title: box(cell.querySelector('[data-grid-title]')),
        reason: box(cell.querySelector('[data-grid-reason]')),
        imgVisible: img !== null && getComputedStyle(img).visibility === 'visible',
        spinner: cell.querySelector('[role="progressbar"], [data-spinner]') !== null,
        treatment: img === null ? null : img.getAttribute('data-cover-treatment'),
      };
    })()`) as Promise<{ ground: { top: number; left: number; width: number; height: number } | null; title: { top: number; left: number; width: number; height: number } | null; reason: { top: number; left: number; width: number; height: number } | null; imgVisible: boolean; spinner: boolean; treatment: string | null }>;

    const before = await read(page);
    expect(before.ground, 'the ground is drawn').not.toBeNull();
    expect(before.ground?.width, 'a ground the cover’s size: the cell’s 160').toBeCloseTo(160, 0);
    expect(before.ground?.height, 'square, before any image').toBeCloseTo(160, 0);
    expect(before.title, 'the title drawn at once').not.toBeNull();
    expect(before.reason, 'the reason drawn at once').not.toBeNull();
    expect(before.imgVisible, 'no partial cover while it loads').toBe(false);
    expect(before.spinner, 'no spinner').toBe(false);

    for (const route of held.splice(0)) await route.fulfill({ status: 200, contentType: 'image/png', body: COVER });
    await expect.poll(async () => (await read(page)).treatment, { timeout: 60_000, message: 'the cover arrives and is placed' }).not.toBeNull();
    const after = await read(page);
    expect(after.imgVisible, 'the cover fills the ground').toBe(true);
    for (const part of ['ground', 'title', 'reason'] as const) {
      expect.soft(after[part]?.top, `the ${part} does not move when the cover arrives`).toBeCloseTo(before[part]?.top ?? NaN, 0);
      expect.soft(after[part]?.height, `the ${part} keeps its height`).toBeCloseTo(before[part]?.height ?? NaN, 0);
    }
  } finally {
    await removeRecordsFor(artist.id);
  }
});
