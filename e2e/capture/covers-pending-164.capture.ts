import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Route } from '@playwright/test';
import sharp from 'sharp';
import { OUT_MS } from '../../src/app/wall/gesture';
import { COLLECTION_SPINES } from '../../test/fixtures/collection-spines';
import { near, pixelAt } from '../pixel-read';
import { login } from '../sign-in';
import { clickSpine, wallAtRest } from '../wall-ready';

/**
 * **Step 164, §W.8: the pending field, captured from the build at 1440 × 900
 * (Design's Capture bullet).** The probe wall with Wired's cover held in
 * flight: a pull lands on the field in the record's colour with no type;
 * the response is then released and the cover takes the field's place.
 * Two stills in `docs/captures/covers-164/`. Run with CAPTURE=1
 * --project=capture.
 */
const OUT = join('docs', 'captures', 'covers-164');

test('the pending field at 1440 × 900, and the cover arrived', async ({ page }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  mkdirSync(OUT, { recursive: true });
  const cover = '/e2e-covers/164-capture.png';
  /* A photograph-sized solid, so the arrived still shows a cover and not a dot. */
  const png = await sharp({ create: { width: 600, height: 600, channels: 3, background: { r: 120, g: 40, b: 30 } } }).png().toBuffer();
  const held: Route[] = [];
  await page.route(`**${cover}`, (route) => { held.push(route); });

  await login(page);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.clock.install();
  await page.goto(`/wall/probe/labelled?cover=${encodeURIComponent(cover)}`);
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  await wallAtRest(page);
  await expect.poll(() => held.length, { timeout: 15_000 }).toBe(1);
  await page.clock.pauseAt(Date.now() + 1000);

  const wired = `collection-${COLLECTION_SPINES.findIndex((row) => row.title === 'Wired')}`;
  await clickSpine(page, page.locator(`[data-seat="${wired}"] [data-spine]`));
  await page.clock.runFor(OUT_MS + 40);
  await expect(page.locator('[data-pulled] [data-no-cover]')).toHaveCount(0);
  await page.screenshot({ path: join(OUT, 'pending-1440x900.png') });

  const centre = await page.locator('[data-pulled] [data-field]').evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  for (const route of held) await route.fulfill({ contentType: 'image/png', body: png });
  await expect.poll(async () => near(await pixelAt(page, centre.x, centre.y), [120, 40, 30]), { timeout: 10_000 }).toBe(true);
  await page.screenshot({ path: join(OUT, 'arrived-1440x900.png') });
});
