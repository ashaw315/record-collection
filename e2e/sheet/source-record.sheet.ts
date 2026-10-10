import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { clearing, firstDrawingWidth } from '../../src/app/figure-source';
import { FIGURE_FRACTION, FORK, SIDEBAR } from '../../src/app/sidebar-layout';
import { login } from './login';

/**
 * §T.6's source record on the real collection, step 115: every record's
 * first-drawing width, which record the figures are drawn from and in what
 * tint, and the table and the grid at seven windows. This file's output is
 * the standing record of which record is the source: run again after a
 * record is added, a changed first line is a changed source, by name.
 *
 * Read-only. Nothing is pressed, and no record's page is opened.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'source-115');
const WIDTHS = [1920, 1440, 1081, 1080, FORK, 1024, 390];

test('the source record by first-drawing width, every record’s width, and the table and grid at seven windows', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const open = async (view: string, width: number) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto(`/?view=${view}`);
    await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(800);
    return page.evaluate(() => {
      const head = document.querySelector<HTMLElement>('[data-head-figure]');
      const drawn = head !== null && head.getClientRects().length > 0 && getComputedStyle(head).display !== 'none';
      const b = head?.getBoundingClientRect();
      const fragment = document.querySelector<HTMLElement>('[data-sidebar-fragment]');
      /* By the id alone: a record's path built here would read to `specs-import-constants` as a visit to its page, which a sheet must not make. */
      const rows = Array.from(document.querySelectorAll<HTMLTableRowElement>('main [data-collection-table] tbody tr')).map((tr) => ({
        id: (tr.querySelector('a[href]')?.getAttribute('href') ?? '').split('/').pop() ?? '',
        cells: [(tr.querySelector('a[href]')?.textContent ?? '').trim(), (tr.querySelector('a[href]')?.nextElementSibling?.textContent ?? '').trim()],
      }));
      return {
        record: head?.dataset.record ?? '', clearing: Number(head?.dataset.clearing), aspect: Number(head?.dataset.aspect), firstDraws: Number(head?.dataset.firstDraws), tint: head?.dataset.tint ?? '',
        drawn, width: drawn && b ? b.width : 0, height: drawn && b ? b.height : 0,
        fragment: fragment !== null && fragment.getClientRects().length > 0,
        sidebar: (document.querySelector<HTMLElement>('[data-collection-sidebar]')?.getBoundingClientRect().width ?? 0) > 300 && getComputedStyle(document.querySelector('[data-collection-sidebar]') as HTMLElement).borderRightWidth !== '0px',
        count: document.querySelector('[data-collection-count]')?.textContent?.trim() ?? '', rows,
      };
    });
  };

  const first = await open('table', 1440);
  const records = first.rows.filter((row) => /^[0-9a-f-]{36}$/.test(row.id)).map((row) => {
    const shape = clearing(row.id);
    return { ...row, shape, firstDraws: firstDrawingWidth(shape) };
  }).sort((a, b) => a.firstDraws - b.firstDraws);
  const name = (cells: string[]) => cells.filter((c) => c !== '').join(', ');
  const source = records.find((row) => row.id === first.record);
  const lowest = [...records].sort((a, b) => a.shape.height - b.shape.height)[0];
  const md = ['# Step 115: the source record by first-drawing width, on the real collection', '', 'Read-only, desktop Chromium, windows 1000 tall.', '',
    `**The source is ${source === undefined ? `\`${first.record}\`, which this page does not list` : name(source.cells)}** (\`${first.record}\`): clearing height ${first.clearing.toFixed(1)}, aspect ${first.aspect.toFixed(3)}, first drawing at **${first.firstDraws.toFixed(1)}**, tint \`${first.tint || 'none'}\`. ${first.count}; the table lists ${records.length}.`, '',
    `The record with the lowest clearing height is ${name(lowest.cells)} (${lowest.shape.height.toFixed(1)}), which first draws at ${lowest.firstDraws.toFixed(1)}${lowest.id === first.record ? ' and is the source' : ' and is not the source'}.`, '',
    '## Every record, narrowest first-drawing window first', '', '| record | clearing height | aspect | first draws at | |', '|---|---|---|---|---|',
    ...records.map((row) => `| ${name(row.cells)} | ${row.shape.height.toFixed(1)} | ${row.shape.aspect.toFixed(3)} | ${row.firstDraws.toFixed(1)} | ${row.id === first.record ? 'the source' : ''} |`), '',
    '## The table and the grid', '', '| view | window | sidebar | head figure | figure | its height against the clearing | fragment | capture |', '|---|---|---|---|---|---|---|---|'];
  for (const view of ['table', 'grid']) {
    for (const width of WIDTHS) {
      const m = await open(view, width);
      const tall = ((Math.min(width, 1440) - SIDEBAR.taken) * FIGURE_FRACTION) / m.aspect;
      const file = `${view}-w${width}-${m.drawn ? `figure-h${Math.round(m.height)}` : 'no-figure'}.png`;
      await page.screenshot({ path: join(OUT, file) });
      md.push(`| ${view} | ${width} | ${m.sidebar ? 'yes' : 'no'} | ${m.drawn ? 'yes' : 'no'} | ${m.drawn ? `${m.width.toFixed(1)} × ${m.height.toFixed(1)}` : ''} | ${m.sidebar ? `${tall.toFixed(1)} against ${m.clearing.toFixed(1)}` : ''} | ${m.fragment ? 'yes' : 'no'} | ${file} |`);
    }
  }
  writeFileSync(join(OUT, 'source-115.md'), `${md.join('\n')}\n`);
});
