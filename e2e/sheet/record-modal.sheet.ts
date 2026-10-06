import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { sleeveSquare } from '../../src/app/records/[id]/sleeve-modal';
import { readSeventeen } from '../seventeen';
import { login } from './login';

/**
 * **The record modal on the real collection (step 81): closed and turned,
 * at 390 and 1440.** Read-only. The record is named by `MODAL_RECORD`, a
 * title from the collection, so the sheet says which sleeve it shows.
 *
 * Named by what differs between shots of one record and window: the face,
 * and the square's side (`-front-s354`).
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'record-modal-81');
const TITLE = process.env.MODAL_RECORD ?? 'Bitches Brew';
const WINDOWS: ReadonlyArray<readonly [number, number]> = [[390, 844], [GRID_FORK, NO_SCROLL_HEIGHT]];

test('the record modal: front and back at two windows, with a manifest', async ({ page }) => {
  const record = readSeventeen().find((r) => r.title === TITLE);
  if (record === undefined) throw new Error(`No record titled ${TITLE} in docs/captures/real-records.json.`);
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const slug = TITLE.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const manifest: unknown[] = [];
  for (const [width, height] of WINDOWS) {
    await page.setViewportSize({ width, height });
    await page.goto(`/records/${record.id}`);
    await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.getByRole('button', { name: 'Open the sleeve' }).click();
    await page.locator('[data-sleeve-modal]').waitFor();
    for (const face of ['front', 'back'] as const) {
      if (face === 'back') await page.locator('[data-sleeve-control="turn"]').click();
      const img = page.locator(`[data-sleeve] img[data-sleeve-face="${face}"]`);
      const photographed = (await img.count()) > 0;
      if (photographed) await img.evaluate((el) => (el as HTMLImageElement).decode());
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(1, height - 1);
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => {
        const sq = (document.querySelector('[data-sleeve]') as HTMLElement).getBoundingClientRect();
        const img = document.querySelector<HTMLImageElement>('[data-sleeve] img[data-sleeve-face]');
        return { square: [sq.left, sq.top, sq.width, sq.height], label: (document.querySelector('[data-face-label]') as HTMLElement).textContent, natural: img === null ? null : [img.naturalWidth, img.naturalHeight] };
      });
      const file = `modal-${slug}-${String(width).padStart(4, '0')}x${height}-${face}-s${sleeveSquare(width, height)}.png`;
      await page.screenshot({ path: join(OUT, file) });
      manifest.push({ record: TITLE, width, height, face, photographed, file, ...m });
    }
  }
  writeFileSync(join(OUT, `manifest-${slug}.json`), `${JSON.stringify(manifest, null, 1)}\n`);
});
