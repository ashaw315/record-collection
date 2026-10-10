import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * The want list's way in and its empty state (§T.6), read-only on the real
 * collection, for Adam: LOOK UP A RECORD in the heading's row on both
 * views, and, where a view is empty, whether the figure holds in its space
 * and at what size.
 *
 * Nothing is pressed. Desktop Chromium.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'want-list-empty-112');
const WINDOWS: [number, number][] = [[1440, 900], [390, 664], [320, 664]];

test('the want list’s control, and its empty state where a view is empty', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# The want list’s way in and its empty state, on the real collection', '', 'Read-only, desktop Chromium.', '', '| view | window | rows | control, left to right and top | empty state | the column | figure | sentence |', '|---|---|---|---|---|---|---|---|'];
  for (const [view, path] of [['still wanted', '/want-list'], ['acquired', '/want-list?acquired=true']] as const) {
    for (const [width, height] of WINDOWS) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const r = await page.evaluate(() => {
        const r1 = (n: number) => Math.round(n * 10) / 10;
        const c = document.querySelector('[data-want-list-lookup]')?.getBoundingClientRect();
        const empty = document.querySelector<HTMLElement>('[data-want-list-empty]');
        const svg = empty?.querySelector('svg')?.getBoundingClientRect();
        return { rows: document.querySelectorAll('main ul > li').length, control: c === undefined ? 'none' : `${r1(c.left)} to ${r1(c.right)}, ${r1(c.top)}`, empty: empty !== null, column: empty === null ? '' : `${r1(empty.getBoundingClientRect().width)} wide`, figure: svg === undefined ? (empty === null ? '' : 'none') : `${r1(svg.width)} × ${r1(svg.height)}`, sentence: (empty?.querySelector('p')?.textContent ?? '').trim() };
      });
      await page.screenshot({ path: join(OUT, `want-list-${view.replace(' ', '-')}-${String(width).padStart(4, '0')}x${height}.png`) });
      md.push(`| ${view} | ${width} × ${height} | ${r.rows} | ${r.control} | ${r.empty ? 'yes' : 'no'} | ${r.column} | ${r.figure} | ${r.sentence === '' ? '' : `“${r.sentence}”`} |`);
    }
  }
  writeFileSync(join(OUT, 'want-list-empty-112.md'), `${md.join('\n')}\n`);
});
