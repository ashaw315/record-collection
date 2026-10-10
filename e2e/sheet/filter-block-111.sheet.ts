import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * For step 111, before it is built: "first measure the filter block and
 * report its lines' order and height", and "remove any gap between the
 * filter lines beyond their 44s, and report what it was". Read-only on the
 * real collection, with no filter in force and with a year filter in
 * force, which adds the line about records with no release year and CLEAR.
 *
 * Nothing is pressed; the filter is in the address. Desktop Chromium.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'filter-block-111');
const WIDTHS = [1920, 1440, 1024, 768];

test('the filter block’s lines, in order, with their heights and the gaps between them', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# The filter block (for step 111), on the real collection', '', 'Read-only, desktop Chromium. Tops and feet are from the window’s top with the page unscrolled.', ''];
  for (const view of ['table', 'grid']) {
    for (const [state, query] of [['no filter in force', ''], ['a year filter in force', '&yearFrom=1970']] as const) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/?view=${view}${query}`);
        await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        const r = await page.evaluate(() => {
          const r1 = (n: number) => Math.round(n * 10) / 10;
          const root = document.querySelector('[data-collection-filters]') as HTMLElement;
          const named: [string, string][] = [['Sort', '[data-sort-control]'], ['Genre', '[data-filter="genreId"] [data-filter-trigger]'], ['Label', '[data-filter="labelId"] [data-filter-trigger]'], ['Store', '[data-filter="storeId"] [data-filter-trigger]'], ['Tag', '[data-filter="tagId"] [data-filter-trigger]'], ['No release year', '[data-filter-undated], [data-filter-undated] ~ span'], ['Clear', '[data-filter-clear]']];
          const lines = named.flatMap(([name, selector]) => { const el = root.querySelector<HTMLElement>(selector); if (el === null) return []; const b = el.getBoundingClientRect(); return [{ name, top: r1(b.top), foot: r1(b.bottom), height: r1(b.height), left: r1(b.left), right: r1(b.right) }]; }).sort((a, b) => a.top - b.top);
          const list = document.querySelector<HTMLElement>('main [data-collection-table] table, main [data-collection-grid]');
          const head = document.querySelector<HTMLElement>('main [data-collection-heading] h1');
          const block = root.getBoundingClientRect();
          return { lines, block: { top: r1(block.top), foot: r1(block.bottom), height: r1(block.height) }, headingFoot: head === null ? null : r1(head.getBoundingClientRect().bottom), listTop: list === null ? null : r1(list.getBoundingClientRect().top), listRight: list === null ? null : r1(list.getBoundingClientRect().right), listLeft: list === null ? null : r1(list.getBoundingClientRect().left) };
        });
        md.push(`## ${view}, ${width} wide, ${state}`, '', `Heading’s foot ${r.headingFoot}. The filters’ own box ${r.block.top} to ${r.block.foot} (${r.block.height}). The list starts at ${r.listTop}, and runs ${r.listLeft} to ${r.listRight}.`, '', '| line | top | foot | height | gap above | left to right |', '|---|---|---|---|---|---|');
        r.lines.forEach((line, i) => md.push(`| ${line.name} | ${line.top} | ${line.foot} | ${line.height} | ${i === 0 ? '' : Math.round((line.top - r.lines[i - 1].foot) * 10) / 10} | ${line.left} to ${line.right} |`));
        const first = r.lines[0];
        const last = r.lines[r.lines.length - 1];
        md.push('', `First line’s top to last line’s foot: **${Math.round((last.foot - first.top) * 10) / 10}**. Last line’s foot to the list: ${r.listTop === null ? '' : Math.round((r.listTop - last.foot) * 10) / 10}.`, '');
      }
    }
  }
  writeFileSync(join(OUT, 'filter-block-111.md'), `${md.join('\n')}\n`);
});
