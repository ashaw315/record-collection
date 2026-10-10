import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { FORK, gridColumns } from '../../src/app/sidebar-layout';
import { login } from './login';

/**
 * Step 116, for Design to write §T.5's figures in from: how many covers
 * the grid draws to a row and how large, on the real collection, either
 * side of the 1054 fork and at six other windows. The two figures it
 * replaces, "four covers from the fork" and "six covers of 164 or four of
 * 164", were measured at the abandoned 1145 fork.
 *
 * Read-only. Nothing is pressed.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'grid-fork-116');
const WIDTHS = [1920, 1440, 1081, 1080, FORK, FORK - 1, 1024, 390];
const r1 = (n: number) => String(Math.round(n * 10) / 10);

test('the grid’s covers to a row and their size at eight windows, either side of the fork', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# Step 116: the grid’s cover count and cover size, on the real collection', '', 'Read-only, desktop Chromium, windows 1000 tall. A cover is the square the grid draws, measured as drawn; the gap is between two covers in a row.', '',
    '| window | sidebar | grid, left to right | grid’s width | covers to a row | by 184n − 24 | cover | gap | rows | records | capture |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?view=grid');
    await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(800);
    const m = await page.evaluate(() => {
      const grid = document.querySelector<HTMLElement>('main [data-collection-grid]');
      if (grid === null) return null;
      const g = grid.getBoundingClientRect();
      const covers = Array.from(grid.querySelectorAll<HTMLElement>('[data-grid-cover]')).map((el) => el.getBoundingClientRect());
      const firstRow = covers.filter((b) => Math.abs(b.top - covers[0].top) < 1);
      const side = document.querySelector<HTMLElement>('[data-collection-sidebar]');
      return {
        left: g.left, right: g.right, columns: firstRow.length, cover: { width: covers[0].width, height: covers[0].height },
        widths: [...new Set(covers.map((b) => Math.round(b.width * 10) / 10))],
        gap: firstRow.length > 1 ? firstRow[1].left - firstRow[0].right : 0,
        rows: new Set(covers.map((b) => Math.round(b.top))).size, records: covers.length,
        sidebar: side !== null && getComputedStyle(side).borderRightWidth !== '0px',
      };
    });
    if (m === null) throw new Error(`no grid at ${width}`);
    const file = `grid-w${width}-${m.columns}-covers-of-${Math.round(m.cover.width)}.png`;
    await page.screenshot({ path: join(OUT, file) });
    md.push(`| ${width} | ${m.sidebar ? 'yes' : 'no'} | ${r1(m.left)} to ${r1(m.right)} | ${r1(m.right - m.left)} | **${m.columns}** | ${gridColumns(m.right - m.left)} | **${r1(m.cover.width)} × ${r1(m.cover.height)}**${m.widths.length > 1 ? ` (widths drawn: ${m.widths.join(', ')})` : ''} | ${r1(m.gap)} | ${m.rows} | ${m.records} | ${file} |`);
  }
  writeFileSync(join(OUT, 'grid-fork-116.md'), `${md.join('\n')}\n`);
});
