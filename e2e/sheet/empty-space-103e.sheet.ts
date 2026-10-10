import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { login } from './login';

/**
 * For step 103e, before it is built: the space the table's and the grid's
 * empty state has, read-only on the real collection, under a search that
 * matches nothing.
 *
 * §T.6: the empty state's figure is drawn "at the largest height its space
 * holds, and no smaller than the height at which its narrowest face clears
 * §29's 6px". What bounds that space is not said, and the two readings
 * give different answers at every width, so both are measured: the list's
 * place down to the window's bottom, and the list's column by its width
 * alone, the page being free to scroll.
 *
 * Nothing is pressed; the search is in the address. Desktop Chromium.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'empty-space-103e');
const WINDOWS: [number, number][] = [[1440, 900], [1024, 900], [768, 900], [390, 664], [320, 664]];
/* What stands with the figure, as the shelf's empty state has it (step 104): the sentence's line, 18, and a 44 control. */
const BLOCK = 20 + 18 + 44;
const MARGIN = 24;

const read = (page: Page) =>
  page.evaluate(() => {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const empty = document.querySelector<HTMLElement>('[data-collection-empty]');
    const figure = document.querySelector<HTMLElement>('[data-heading-figure]');
    if (empty === null) return null;
    const e = empty.getBoundingClientRect();
    return { top: r1(e.top), left: r1(e.left), width: r1(e.width), height: r1(e.height), text: (empty.textContent ?? '').trim(), windowHeight: window.innerHeight, clearing: Number(figure?.getAttribute('data-clearing') ?? 0), headingFigure: figure?.getAttribute('data-drawn') === 'true', aspect: (() => { const vb = figure?.querySelector('svg')?.getAttribute('viewBox')?.split(' ').map(Number); return vb === undefined ? null : vb[2] / vb[3]; })() };
  });

test('the space the table’s and the grid’s empty state has', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# The empty state’s space on the table and the grid (for step 103e), on the real collection', '', 'A search that matches nothing. Read-only, desktop Chromium. The block under a figure is taken as the sentence’s line, 18 and a 44 control (82), with 24 above the figure and 24 beneath the control.', '', '| view | window | what it says now | its top | column | to the window’s bottom | figure if the window bounds it | figure if the column’s width bounds it | heading figure also drawn |', '|---|---|---|---|---|---|---|---|---|'];
  const all: unknown[] = [];
  let aspect = 1.19;
  for (const view of ['table', 'grid']) {
    for (const [width, height] of WINDOWS) {
      await page.setViewportSize({ width, height });
      await page.goto(`/?view=${view}&q=zzzzqqqq-nothing-matches-this`);
      await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(600);
      const r = await read(page);
      all.push({ view, width, height, ...r });
      if (r === null) { md.push(`| ${view} | ${width} × ${height} | no empty state found | | | | | | |`); continue; }
      if (r.aspect !== null) aspect = r.aspect;
      await page.screenshot({ path: join(OUT, `empty-${view}-${String(width).padStart(4, '0')}x${height}.png`) });
      const toBottom = r.windowHeight - r.top;
      const byWindow = Math.min(toBottom - MARGIN - BLOCK - MARGIN, r.width / aspect);
      const byWidth = r.width / aspect;
      const say = (h: number) => `${Math.round(h)}${h >= r.clearing ? '' : ' (under the clearing height: none)'}`;
      md.push(`| ${view} | ${width} × ${height} | “${r.text}” | ${r.top} | ${r.width} wide | ${Math.round(toBottom)} | ${say(byWindow)} | ${say(byWidth)} | ${r.headingFigure ? 'yes' : 'no'} |`);
    }
  }
  writeFileSync(join(OUT, 'empty-space-103e.md'), `${md.join('\n')}\n`);
  writeFileSync(join(OUT, 'empty-space-103e.json'), `${JSON.stringify(all, null, 1)}\n`);
});
