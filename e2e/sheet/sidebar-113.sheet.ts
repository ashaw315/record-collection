import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { FORK } from '../../src/app/sidebar-layout';
import { login } from './login';

/**
 * Steps 113 and 114, for Adam to judge against his wireframe: the table and
 * the grid on the real collection at 1920, 1440, 1024, 390 and either side
 * of the sidebar's fork, with the figures the handoff asks to be reported;
 * the want list at 1440, "to show the wordmark beside its capped content";
 * and the wordmark's left on three screens at four widths.
 *
 * Read-only. Nothing is pressed but one filter line, to show it open.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'sidebar-113');
const WIDTHS = [1920, 1440, FORK, FORK - 1, 1024, 390];
const r1 = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(Math.round(n * 10) / 10));

test('the table and the grid with the sidebar, the want list under the full-width header, and the figures', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# Steps 113 and 114 on the real collection', '', 'Read-only, desktop Chromium, windows 1000 tall. Positions are from the window’s left and top with the page unscrolled.', ''];

  md.push('## The table and the grid', '', '| view | window | sidebar | content column | head figure | head’s height | figure’s top below the header | list’s top | grid columns | cover | Record column | capture |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const view of ['table', 'grid']) {
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(`/?view=${view}`);
      await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.waitForTimeout(1200);
      const m = await page.evaluate(() => {
        const box = (s: string) => { const el = document.querySelector<HTMLElement>(s); return el === null || el.getClientRects().length === 0 ? null : el.getBoundingClientRect(); };
        const side = box('[data-collection-sidebar]');
        const rule = side === null ? '0px' : getComputedStyle(document.querySelector('[data-collection-sidebar]') as HTMLElement).borderRightWidth;
        const list = box('main [data-collection-table] table, main [data-collection-grid]');
        const grid = document.querySelector<HTMLElement>('main [data-collection-grid]');
        const header = box('[data-app-nav]');
        const head = box('[data-collection-head]');
        const figure = box('[data-head-figure]');
        return {
          sidebar: rule === '1px' && side !== null ? side.width : null,
          column: list?.width ?? null, left: list?.left ?? null, right: list?.right ?? null,
          figure: figure === null ? null : [figure.width, figure.height], head: head?.height ?? null,
          figureTop: figure === null || header === null ? null : figure.top - header.bottom,
          listTop: list?.top ?? null,
          columns: grid === null ? null : getComputedStyle(grid).gridTemplateColumns.split(' ').length,
          cover: grid?.querySelector('li')?.getBoundingClientRect().width ?? null,
          record: document.querySelector('main [data-collection-table] thead th')?.getBoundingClientRect().width ?? null,
        };
      });
      const name = `${view}-w${width}.png`;
      await page.screenshot({ path: join(OUT, name) });
      md.push(`| ${view} | ${width} | ${m.sidebar === null ? 'none' : r1(m.sidebar)} | ${r1(m.column)} (${r1(m.left)} to ${r1(m.right)}) | ${m.figure === null ? 'none' : `${r1(m.figure[0])} × ${r1(m.figure[1])}`} | ${r1(m.head)} | ${r1(m.figureTop)} | ${r1(m.listTop)} | ${m.columns ?? ''} | ${r1(m.cover)} | ${r1(m.record)} | ${name} |`);
    }
  }

  /* One filter open at 1440, and the whole page, so the fragment is seen wherever the page puts it. */
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/?view=table');
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.waitForTimeout(1200);
  await page.screenshot({ path: join(OUT, 'table-w1440-whole-page.png'), fullPage: true });
  await page.locator('[data-filter="genreId"] [data-filter-trigger]').click();
  await page.locator('[data-filter-panel]').waitFor();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(OUT, 'table-w1440-genre-open.png') });
  md.push('', 'Also: `table-w1440-whole-page.png`, the page to its foot, and `table-w1440-genre-open.png`, Genre open.', '');

  md.push('## The wordmark’s left (step 114)', '', '| screen | 320 | 1024 | 1440 | 1920 |', '|---|---|---|---|---|');
  for (const [name, path] of [['the table', '/?view=table'], ['the shelf', '/'], ['the want list', '/want-list']] as const) {
    const cells: string[] = [];
    for (const width of [320, 1024, 1440, 1920]) {
      await page.setViewportSize({ width, height: 1000 });
      await page.goto(path);
      await page.locator('[data-wordmark]').waitFor({ timeout: 60_000 });
      await page.evaluate(() => document.fonts.ready);
      cells.push(r1(await page.evaluate(() => { const r = document.createRange(); r.selectNodeContents(document.querySelector('[data-wordmark]') as HTMLElement); return r.getBoundingClientRect().left; })));
    }
    md.push(`| ${name} | ${cells.join(' | ')} |`);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/want-list');
  await page.locator('h1').first().waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.waitForTimeout(800);
  await page.screenshot({ path: join(OUT, 'want-list-w1440.png') });
  md.push('', '`want-list-w1440.png`: the want list at 1440, the wordmark at the window’s 18 beside content still capped and centred.', '');

  writeFileSync(join(OUT, 'sidebar-113.md'), `${md.join('\n')}\n`);
});
