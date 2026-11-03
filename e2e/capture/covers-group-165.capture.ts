import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { registerCleanup, trackArtist } from '../cleanup';
import { seedImage } from '../seed';
import { login } from '../sign-in';

/**
 * **Step 165, §62: the covers group, captured (Design's Capture bullet).**
 * The group with three covers, and the page after the shown cover is
 * deleted, at 1440 × 900 and at 390, scrolled to the Images section. Written
 * to `docs/captures/covers-group-165/`. Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'covers-group-165');
registerCleanup();

const solid = async (r: number, g: number, b: number) =>
  `data:image/png;base64,${(await sharp({ create: { width: 600, height: 600, channels: 3, background: { r, g, b } } }).png().toBuffer()).toString('base64')}`;

async function seedThreeCovers(page: Page, stamp: string): Promise<string> {
  const artist = await page.request.post('/api/artists', { data: { name: `Covers165c-${stamp}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Covers group ${stamp}`, artistId } });
  const { id } = (await r.json()) as { id: string };
  for (const url of [await solid(200, 40, 40), await solid(40, 160, 60), await solid(40, 60, 200)]) await seedImage({ recordId: id, imageType: 'cover', url });
  return id;
}

for (const [width, height] of [[1440, NO_SCROLL_HEIGHT], [390, 844]] as const) {
  test(`the covers group at ${width}, and after the shown cover is deleted`, async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    mkdirSync(OUT, { recursive: true });
    await login(page);
    await page.setViewportSize({ width, height });
    const recordId = await seedThreeCovers(page, `${Date.now().toString(36)}-${width}`);
    await page.goto(`/records/${recordId}`);
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
    const group = page.locator('[data-cover-group]');
    await expect(group.locator('[data-cover-tile]')).toHaveCount(3);
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `group-${width}x${height}.png`) });

    page.on('dialog', (dialog) => dialog.accept());
    await group.locator('[data-cover-tile][data-shown]').getByRole('button', { name: 'Delete this cover image' }).click();
    await expect(group.locator('[data-cover-tile]')).toHaveCount(2, { timeout: 15_000 });
    await group.scrollIntoViewIfNeeded();
    await page.screenshot({ path: join(OUT, `deleted-shown-${width}x${height}.png`) });
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: join(OUT, `deleted-shown-top-${width}x${height}.png`) });
  });
}
