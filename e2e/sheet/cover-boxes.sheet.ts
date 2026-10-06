import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { test } from '@playwright/test';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { readSeventeen } from '../seventeen';
import { login } from './login';

/**
 * **Every real cover's final box and treatment, as a file to compare.**
 * Read-only. Step 83 read the real covers once and kept only a count ("64 of
 * 64"), so step 85 had nothing to compare against but that sentence. This
 * writes the readings: per record and width, whether a cover drew, its
 * treatment once decided, whether it is visible, its box within its cell,
 * and the photograph's own dimensions. Run it before and after a change to
 * the cover and diff the two files.
 */
const OUT = process.env.SHEET_OUT ?? '';
const WIDTHS = [390, 1000, GRID_FORK, 1920];

test('the real covers: box, treatment and visibility at four widths', async ({ page }) => {
  if (OUT === '') throw new Error('Set SHEET_OUT to the file the readings are written to.');
  mkdirSync(dirname(OUT), { recursive: true });
  await login(page);
  const lines: string[] = [];
  for (const r of readSeventeen()) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
      await page.goto(`/records/${r.id}`);
      await page.locator('[data-testid="record-page-8a"]').waitFor({ timeout: 30_000 });
      const cover = page.locator('[data-cell="sleeve"] img[data-cover]');
      const drew = (await cover.count()) > 0;
      if (drew) await page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]').waitFor({ timeout: 30_000 });
      const m = drew
        ? await cover.evaluate((el) => {
            const img = el as HTMLImageElement;
            const b = img.getBoundingClientRect();
            const cell = (img.closest('[data-cell="sleeve"]') as HTMLElement).getBoundingClientRect();
            const cs = getComputedStyle(img);
            const n = (v: number) => Math.round(v * 100) / 100;
            return {
              treatment: img.getAttribute('data-cover-treatment'),
              visibility: cs.visibility, fit: cs.objectFit,
              box: [n(b.left - cell.left), n(b.top - cell.top), n(b.width), n(b.height)],
              natural: [img.naturalWidth, img.naturalHeight],
            };
          })
        : null;
      lines.push(JSON.stringify({ record: r.title, width, cover: m }));
    }
  }
  writeFileSync(OUT, `${lines.join('\n')}\n`);
});
