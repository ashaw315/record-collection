import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from '../cleanup';
import { removeRecordsFor, seedRecords } from '../seed';
import { login } from '../sign-in';
import { wallMeasured } from '../wall-measured';
import { nearViewMinWidth } from '../../src/app/wall/view-fork';

/**
 * **The ask field with a phrase longer than it, in every host (the coordinator, 13 Nov, for Design's ruling on §P.5's
 * "its width is the host's").** Adam typed a phrase into the shelf's rail and it scrolled out of sight. Nothing is
 * built for it; this is the specimen Design rules on. One phrase, typed and not asked, in each host the field draws in,
 * twice: while typing (focused, the caret at the end, the field scrolled to it) and after leaving the field. Beside each
 * picture the field's figures: its content box, the phrase's full width, and the share of the phrase in view.
 * The records are seeded under an artist filter, the field needing none of the collection. Written to
 * `docs/captures/ask-overflow/`. Run with CAPTURE=1 E2E_SERVER=build --project=capture.
 */
const OUT = join('docs', 'captures', 'ask-overflow');
registerCleanup();

/** A phrase of the kind Adam typed, which Code was not shown: an ordinary sentence of what to play, 52 characters. */
const PHRASE = 'something slow and warm for a rainy sunday morning';

const control = (page: Page) => page.locator('[data-pick-control]').filter({ visible: true });
const field = (page: Page) => control(page).locator('[data-ask-field]');
const filtersReady = (page: Page) => page.locator('[data-collection-filters][data-hydrated="true"]').first().waitFor({ timeout: 30_000 });

type Row = { host: string; window: string; file: string; contentBox: number; phraseWidth: number; inView: string };
const rows: Row[] = [];

async function capture(page: Page, open: () => Promise<void>, host: string, name: string) {
  await open();
  const viewport = page.viewportSize();
  const window = viewport === null ? '?' : `${viewport.width} × ${viewport.height}`;
  await field(page).click();
  await field(page).pressSequentially(PHRASE);
  await page.evaluate(() => document.fonts.ready);
  const figures = await field(page).evaluate((el) => {
    const input = el as HTMLInputElement;
    const style = getComputedStyle(input);
    const contentBox = input.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    /* The phrase's own width, in the field's font: scrollWidth is the box's wherever the phrase fits, so it cannot say by how much. */
    const context = document.createElement('canvas').getContext('2d');
    if (context === null) throw new Error('no 2d context');
    context.font = style.font;
    context.letterSpacing = style.letterSpacing;
    return { contentBox, phraseWidth: context.measureText(input.value).width };
  });
  const inView = `${Math.min(100, Math.round((figures.contentBox / figures.phraseWidth) * 100))}%`;
  for (const state of ['typing', 'left'] as const) {
    if (state === 'left') {
      await page.locator('body').click({ position: { x: 1, y: 1 } });
      await page.mouse.move(0, 0);
    }
    const file = `${name}-${state}.png`;
    const box = await control(page).boundingBox();
    if (box === null) throw new Error(`${name}: no control drawn`);
    /* The control with room round it, so the field reads against its host. */
    const pad = 24;
    const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: Math.min(box.height + pad * 2, 400) };
    await page.screenshot({ path: join(OUT, file), clip });
    await page.screenshot({ path: join(OUT, `${name}-${state}-window.png`) });
    rows.push({ host, window, file, contentBox: Math.round(figures.contentBox * 10) / 10, phraseWidth: Math.round(figures.phraseWidth * 10) / 10, inView });
  }
}

async function seed(page: Page): Promise<string> {
  const suffix = `overflow${Date.now().toString(36)}`;
  const artist = (await (await page.request.post('/api/artists', { data: { name: `Overflow-${suffix}` } })).json()) as { id: string };
  trackArtist(artist.id);
  await seedRecords(artist.id, 'Overflow', suffix, 3);
  return artist.id;
}

test.describe('wide, a fine pointer', () => {
  test.use({ viewport: { width: 1440, height: 900 } });
  test('the shelf, the far view as a column and as a band, the table and the grid', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const artistId = await seed(page);
    try {
      await capture(page, async () => { await page.goto(`/?artistId=${artistId}`); await wallMeasured(page); }, 'the shelf’s rail, a column', 'shelf-1440');
      await capture(page, async () => {
        await page.goto(`/?artistId=${artistId}`);
        await wallMeasured(page);
        await page.getByTestId('wall-zoom-out').click();
        await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
      }, 'the far view’s rail, a column', 'far-view-1440');
      const band = nearViewMinWidth() - 1;
      await page.setViewportSize({ width: band, height: 900 });
      await capture(page, async () => { await page.goto(`/?artistId=${artistId}`); await wallMeasured(page); }, 'the far view’s rail, a band', `far-band-${band}`);
      await page.setViewportSize({ width: 1440, height: 900 });
      for (const view of ['table', 'grid'] as const) {
        await capture(page, async () => { await page.goto(`/?view=${view}&artistId=${artistId}`); await filtersReady(page); }, `the ${view}’s sidebar`, `${view}-1440`);
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(join(OUT, 'figures-1440.json'), `${JSON.stringify(rows, null, 2)}\n`);
  });
});

test.describe('narrow, a coarse pointer', () => {
  test.use({ hasTouch: true, viewport: { width: 390, height: 844 } });
  test('the table and the grid at 390, where the control draws as a band', async ({ page }) => {
    test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
    test.setTimeout(240_000);
    mkdirSync(OUT, { recursive: true });
    await login(page);
    const artistId = await seed(page);
    try {
      for (const view of ['table', 'grid'] as const) {
        await capture(page, async () => { await page.goto(`/?view=${view}&artistId=${artistId}`); await filtersReady(page); }, `the ${view}’s band`, `${view}-390`);
      }
    } finally {
      await removeRecordsFor(artistId);
    }
    writeFileSync(join(OUT, 'figures-390.json'), `${JSON.stringify(rows, null, 2)}\n`);
  });
});
