import { mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { sleeveSquare } from '../../src/app/records/[id]/sleeve-modal';
import { OPEN_MS, spreadSquare } from '../../src/app/records/[id]/sleeve-open';
import { TURN_MS } from '../../src/app/records/[id]/sleeve-turn';
import { FADE_MS, TRAVEL_MS } from '../../src/app/records/[id]/sleeve-travel';
import { readSeventeen } from '../seventeen';
import { login } from './login';

/**
 * **The finished record modal on the real collection (steps 88 to 93).**
 * Read-only. Stills of each resting state and of the cover's keyboard focus
 * ring, and ONE recording per window that shows the modal as a reader meets
 * it: the cover travels in, the sleeve turns over and back, the gatefold
 * opens and folds, and the cover travels home. §M.5: the travel and the
 * turn are judged from one recording, since they share a curve.
 *
 * Written to its own folder, beside step 81's, which this does not rewrite.
 * Named by the figures that differ: the face and the square's side for the
 * stills, the three durations for the recording.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'record-modal-92');
const TITLE = process.env.MODAL_RECORD ?? 'Bitches Brew';
const WINDOWS: ReadonlyArray<readonly [number, number]> = [[390, 844], [GRID_FORK, NO_SCROLL_HEIGHT]];
const slug = TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-');

function theRecord() {
  const record = readSeventeen().find((r) => r.title === TITLE);
  if (record === undefined) throw new Error(`No record titled ${TITLE} in docs/captures/real-records.json.`);
  return record;
}

async function recordPage(page: Page, id: string) {
  await page.goto(`/records/${id}`);
  await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

const rested = async (page: Page) => {
  await page.locator('[data-sleeve-modal]:not([data-travelling])').waitFor();
  await page.waitForFunction(() => getComputedStyle(document.querySelector('[data-sleeve-controls]') as HTMLElement).opacity === '1');
  await page.waitForTimeout(250);
};

test('stills: the focus ring on the cover, and the modal’s front, back and spread, at two windows', async ({ page }) => {
  const record = theRecord();
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const manifest: unknown[] = [];
  for (const [width, height] of WINDOWS) {
    await page.setViewportSize({ width, height });
    await recordPage(page, record.id);
    /* §M.6, step 89: the two-band ring on a cover whose edge is light in places and dark in others. */
    await page.locator('[data-cover-trigger]').scrollIntoViewIfNeeded();
    await page.locator('[data-cover-trigger]').focus();
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Tab');
    const ringed = await page.locator('[data-cover-trigger]').evaluate((el) => el === document.activeElement && el.matches(':focus-visible'));
    const ring = `ring-${slug}-${String(width).padStart(4, '0')}x${height}-focused-paper2-ink2.png`;
    await page.locator('[data-cell="sleeve"]').screenshot({ path: join(OUT, ring) });
    manifest.push({ record: TITLE, width, height, state: 'cover focused by keyboard', focusVisible: ringed, file: ring });

    await page.keyboard.press('Enter');
    await rested(page);
    const S = sleeveSquare(width, height);
    const shot = async (state: string, file: string) => {
      await page.mouse.move(1, height - 1);
      await page.waitForTimeout(200);
      await page.screenshot({ path: join(OUT, file) });
      manifest.push({ record: TITLE, width, height, state, file, label: await page.locator('[data-face-label]').textContent(), controls: await page.locator('[data-sleeve-controls] button').allTextContents() });
    };
    await shot('front', `modal-${slug}-${String(width).padStart(4, '0')}x${height}-front-s${S}.png`);
    await page.locator('[data-sleeve-control="turn"]').click();
    await page.locator('[data-sleeve][data-face="back"]:not([data-turning])').waitFor();
    await shot('back', `modal-${slug}-${String(width).padStart(4, '0')}x${height}-back-s${S}.png`);
    await page.locator('[data-sleeve-control="turn"]').click();
    await page.locator('[data-sleeve][data-face="front"]:not([data-turning])').waitFor();
    if ((await page.locator('[data-sleeve-control="open"]').count()) > 0) {
      await page.locator('[data-sleeve-control="open"]').click();
      await page.locator('[data-spread]:not([data-opening])').waitFor();
      await page.locator('[data-leaf] img').evaluateAll((imgs) => Promise.all(imgs.map((img) => (img as HTMLImageElement).decode())));
      await shot('gatefold open', `modal-${slug}-${String(width).padStart(4, '0')}x${height}-spread-leaf${spreadSquare(width, height)}.png`);
    } else manifest.push({ record: TITLE, width, height, state: 'gatefold', note: 'OPEN is absent: this record does not have both inside photos' });
  }
  writeFileSync(join(OUT, `manifest-${slug}.json`), `${JSON.stringify(manifest, null, 1)}\n`);
});

test('one recording per window: travel in, turn over and back, open and fold, travel home', async ({ browser }) => {
  const record = theRecord();
  mkdirSync(OUT, { recursive: true });
  for (const [width, height] of WINDOWS) {
    const context = await browser.newContext({ viewport: { width, height }, recordVideo: { dir: OUT, size: { width, height } } });
    const page = await context.newPage();
    await login(page);
    await recordPage(page, record.id);
    await page.locator('[data-cover-trigger]').scrollIntoViewIfNeeded();
    await page.waitForTimeout(1000);
    await page.locator('[data-cover-trigger]').click();
    await rested(page);
    await page.waitForTimeout(1000);
    for (const face of ['back', 'front']) {
      await page.locator('[data-sleeve-control="turn"]').click();
      await page.locator(`[data-sleeve][data-face="${face}"]:not([data-turning])`).waitFor();
      await page.waitForTimeout(1200);
    }
    if ((await page.locator('[data-sleeve-control="open"]').count()) > 0) {
      await page.locator('[data-sleeve-control="open"]').click();
      await page.locator('[data-spread]:not([data-opening])').waitFor();
      await page.waitForTimeout(1600);
      await page.locator('[data-sleeve-control="fold"]').click();
      await page.locator('[data-sleeve]').waitFor();
      await page.waitForTimeout(1000);
    }
    await page.locator('[data-sleeve-close]').click();
    await page.locator('[data-sleeve-modal]').waitFor({ state: 'detached' });
    await page.waitForTimeout(900);
    const video = page.video();
    await context.close();
    if (video === null) throw new Error('no recording was made');
    renameSync(await video.path(), join(OUT, `modal-${slug}-${String(width).padStart(4, '0')}x${height}-travel${TRAVEL_MS}-fade${FADE_MS}-turn${TURN_MS}-open${OPEN_MS}-ease-out-cubic.webm`));
  }
});
