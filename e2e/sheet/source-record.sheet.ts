import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { FIGURE_FRACTION, FORK, SIDEBAR } from '../../src/app/sidebar-layout';
import { login } from './login';

/**
 * §T.6's source record on the real collection, after a record was added
 * (10 Oct): which record the head figure is drawn from, its clearing height
 * and its tint, and the windows either side of where its figure first
 * clears. A source that clears lower than the last one moves that window.
 *
 * Read-only. Nothing is pressed.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'source-record');

test('the source record, its clearing height and tint, and where its head figure first draws', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const open = async (width: number) => {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/?view=table');
    await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
    await page.evaluate(() => document.fonts.ready);
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.waitForTimeout(800);
    return page.evaluate(() => {
      const head = document.querySelector<HTMLElement>('[data-head-figure]');
      const drawn = head !== null && head.getClientRects().length > 0 && getComputedStyle(head).display !== 'none';
      const b = head?.getBoundingClientRect();
      const row = head === null ? null :
      /* By the id alone: a record's path built here would read to `specs-import-constants` as a visit to its page, which a sheet must not make. */
      Array.from(document.querySelectorAll<HTMLAnchorElement>('main a[href]')).find((a) => a.getAttribute('href')?.endsWith(String(head.dataset.record))) ?? null;
      return {
        record: head?.dataset.record ?? '', clearing: Number(head?.dataset.clearing), aspect: Number(head?.dataset.aspect), tint: head?.dataset.tint ?? '',
        row: (row?.closest('tr')?.textContent ?? row?.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
        drawn, width: drawn && b ? b.width : 0, height: drawn && b ? b.height : 0,
        records: document.querySelector('[data-collection-count]')?.textContent?.trim() ?? '',
      };
    });
  };
  const at1440 = await open(1440);
  const clears = Math.ceil(SIDEBAR.taken + (at1440.clearing * at1440.aspect) / FIGURE_FRACTION);
  const md = ['# The source record on the real collection', '', 'Read-only, desktop Chromium, windows 1000 tall.', '',
    `The head figure is drawn from record \`${at1440.record}\` (${at1440.row || 'its row is not on this page'}). Clearing height **${at1440.clearing.toFixed(1)}**, aspect ${at1440.aspect.toFixed(3)}, tint \`${at1440.tint}\`. ${at1440.records}`, '',
    `By arithmetic its figure first clears at a window of **${clears}** (the fork is ${FORK}).`, '',
    '| window | head figure drawn | figure | its height against the clearing | capture |', '|---|---|---|---|---|'];
  for (const width of [...new Set([FORK, clears - 1, clears, 1440])]) {
    const m = await open(width);
    const tall = ((Math.min(width, 1440) - SIDEBAR.taken) * FIGURE_FRACTION) / m.aspect;
    const name = `table-w${width}-${m.drawn ? `figure-h${Math.round(m.height)}` : 'no-figure'}.png`;
    await page.screenshot({ path: join(OUT, name) });
    md.push(`| ${width} | ${m.drawn ? 'yes' : 'no'} | ${m.drawn ? `${m.width.toFixed(1)} × ${m.height.toFixed(1)}` : ''} | ${tall.toFixed(1)} against ${m.clearing.toFixed(1)} | ${name} |`);
  }
  writeFileSync(join(OUT, 'source-record.md'), `${md.join('\n')}\n`);
});
