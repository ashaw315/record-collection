import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { login } from './sign-in';

/**
 * **Step 165, §62: the covers group.** "The group lists every cover the
 * record holds, newest first, and the cover the page shows is first and
 * marked as the one shown." Each cover has a delete control. "Deleting the
 * cover shown does what §61 rules: the next newest is shown, and the colour
 * is re-derived from it. In the group, the next cover moves up and takes the
 * mark. Deleting the last cover leaves the record as §54 rules, and the
 * group is gone."
 *
 * Three covers of three colours, seeded oldest to newest, so "newest first"
 * is observable as the reverse of the seeding and the sleeve's own source
 * says which the page shows. The Images line (§62, step 73) is read beside
 * the group: its count stays what the page draws in the frame and the
 * gallery, and its clause names the covers the group now lists.
 */
registerCleanup();

const solid = async (r: number, g: number, b: number) =>
  `data:image/png;base64,${(await sharp({ create: { width: 4, height: 4, channels: 3, background: { r, g, b } } }).png().toBuffer()).toString('base64')}`;

async function seedThreeCovers(page: Page, stamp: string): Promise<{ recordId: string; urls: string[] }> {
  const artist = await page.request.post('/api/artists', { data: { name: `Covers165-${stamp}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Covers165 ${stamp}`, artistId } });
  const { id } = (await r.json()) as { id: string };
  const urls = [await solid(200, 40, 40), await solid(40, 160, 60), await solid(40, 60, 200)];
  for (const url of urls) await seedImage({ recordId: id, imageType: 'cover', url });
  return { recordId: id, urls };
}

const tileSources = (page: Page) => page.locator('[data-cover-group] [data-cover-tile] img').evaluateAll((els) => els.map((el) => (el as HTMLImageElement).getAttribute('src')));
const shownSources = (page: Page) => page.locator('[data-cover-group] [data-cover-tile][data-shown] img').evaluateAll((els) => els.map((el) => (el as HTMLImageElement).getAttribute('src')));
const sleeveSource = (page: Page) => page.locator('[data-cell="sleeve"] img[data-cover]').getAttribute('src');

for (const [width, height] of [[1440, NO_SCROLL_HEIGHT], [390, 844]] as const) {
  test(`at ${width}: the group lists every cover newest first, the shown one first and marked, and deleting runs §61 then §54`, async ({ page }) => {
    test.setTimeout(90_000);
    await login(page);
    await page.setViewportSize({ width, height });
    const { recordId, urls } = await seedThreeCovers(page, `${Date.now().toString(36)}-${width}`);
    const [oldest, middle, newest] = urls;

    await page.goto(`/records/${recordId}`);
    await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });
    await expect(page.locator('[data-cover-group]')).toHaveCount(1);
    expect(await tileSources(page), 'newest first').toEqual([newest, middle, oldest]);
    expect(await shownSources(page), 'only the first is marked').toEqual([newest]);
    expect(await sleeveSource(page), 'the mark is the cover the page shows').toBe(newest);
    const line = page.locator('[data-cell="note"] [data-field="images-line"]');
    await expect(line, 'the line names the covers the group lists').toHaveText(/Images\s*1\s*·\s*2 earlier covers/);

    /* Delete the shown cover: §61's fallback, and the next takes the mark. */
    page.on('dialog', (dialog) => dialog.accept());
    await page.locator('[data-cover-group] [data-cover-tile][data-shown]').getByRole('button', { name: 'Delete this cover image' }).click();
    await expect.poll(() => tileSources(page), { timeout: 15_000 }).toEqual([middle, oldest]);
    expect(await shownSources(page), 'the next newest takes the mark').toEqual([middle]);
    await expect(page.locator('[data-cell="sleeve"] img[data-cover]'), 'and the page shows it').toHaveAttribute('src', middle);
    await expect(line).toHaveText(/Images\s*1\s*·\s*1 earlier cover\b/);

    /* Delete the rest: §54's record, with the group gone. */
    await page.locator('[data-cover-group] [data-cover-tile][data-shown]').getByRole('button', { name: 'Delete this cover image' }).click();
    await expect.poll(() => tileSources(page), { timeout: 15_000 }).toEqual([oldest]);
    await page.locator('[data-cover-group] [data-cover-tile][data-shown]').getByRole('button', { name: 'Delete this cover image' }).click();
    await expect(page.locator('[data-cover-group]')).toHaveCount(0, { timeout: 15_000 });
    await expect(page.locator('[data-cell="sleeve"] img[data-cover]'), 'no cover is shown').toHaveCount(0);
    await expect(page.getByTestId('image-gallery')).toContainText('No images yet');
    await expect(line).toHaveText(/Images\s*0/);
    await expect(page.locator('[data-cell="note"] [data-field="earlier-covers"]')).toHaveCount(0);
  });
}
