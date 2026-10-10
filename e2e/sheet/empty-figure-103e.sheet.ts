import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * Step 103e's empty state on the table and the grid, read-only on the real
 * collection, for Adam: the figure at its clearing height above the
 * sentence and CLEAR FILTERS, under a search that matches nothing.
 *
 * Nothing is pressed; the search is in the address. Desktop Chromium.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'empty-figure-103e');
const WINDOWS: [number, number][] = [[1440, 900], [768, 900], [390, 664], [320, 664]];

test('the empty state’s figure on the table and the grid', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# The empty state’s figure (step 103e), on the real collection', '', 'A search that matches nothing. Read-only, desktop Chromium.', '', '| view | window | figure | its top | sentence | control | constructions on the screen |', '|---|---|---|---|---|---|---|'];
  for (const view of ['table', 'grid']) {
    for (const [width, height] of WINDOWS) {
      await page.setViewportSize({ width, height });
      await page.goto(`/?view=${view}&q=zzzzqqqq-nothing-matches-this`);
      await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const r = await page.evaluate(() => {
        const r1 = (n: number) => Math.round(n * 10) / 10;
        const empty = document.querySelector('[data-collection-empty]');
        const svg = empty?.querySelector('svg')?.getBoundingClientRect();
        return { figure: svg === undefined ? 'none' : `${r1(svg.width)} × ${r1(svg.height)}`, top: svg === undefined ? '' : String(r1(svg.top)), sentence: (empty?.querySelector('p')?.textContent ?? '').trim(), control: (empty?.querySelector('[data-collection-empty-clear]')?.textContent ?? '').trim(), stills: document.querySelectorAll('[data-testid="construction-still"]').length };
      });
      await page.screenshot({ path: join(OUT, `empty-${view}-${String(width).padStart(4, '0')}x${height}.png`), fullPage: true });
      md.push(`| ${view} | ${width} × ${height} | ${r.figure} | ${r.top} | “${r.sentence}” | ${r.control} | ${r.stills} |`);
    }
  }
  writeFileSync(join(OUT, 'empty-figure-103e.md'), `${md.join('\n')}\n`);
});
