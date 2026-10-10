import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { FIGURE_FRACTION, FORK, gridColumns } from '../../src/app/sidebar-layout';
import { login } from './login';

/**
 * Step 117, for Design: the head figure capped at 0.328 of the content
 * column in height, built to the DRAWING reading (nothing reserves a
 * square), with the width the figure occupies beside its drawn size so the
 * other reading can be told from the capture; the list's top; and the
 * grid's covers either side of its four- and five-cover changes.
 *
 * Read-only. Nothing is pressed.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'head-cap-117');
const WIDTHS = [1920, 1440, 1081, 1080, FORK, FORK - 1, 1024, 390];
const r1 = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(Math.round(n * 10) / 10));

test('the capped head figure, the width it occupies, the list’s top, and the grid at its two boundaries', async ({ page }) => {
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
      const shown = (el: HTMLElement | null) => (el !== null && el.getClientRects().length > 0 ? el.getBoundingClientRect() : null);
      const head = document.querySelector<HTMLElement>('[data-head-figure]');
      const box = shown(head);
      const svg = shown(head?.querySelector<HTMLElement>('svg') ?? null);
      /* The marks themselves, inside the svg's box: what is paper and what is drawing. */
      const marks = box === null ? [] : Array.from(head?.querySelectorAll<SVGGraphicsElement>('svg polygon, svg circle, svg ellipse, svg path, svg rect') ?? []).map((m) => m.getBoundingClientRect()).filter((b) => b.width > 0);
      const ink = marks.length === 0 ? null : { left: Math.min(...marks.map((b) => b.left)), right: Math.max(...marks.map((b) => b.right)), top: Math.min(...marks.map((b) => b.top)), bottom: Math.max(...marks.map((b) => b.bottom)) };
      const list = shown(document.querySelector<HTMLElement>('main [data-collection-table] table, main [data-collection-grid]'));
      const headBox = shown(document.querySelector<HTMLElement>('[data-collection-head]'));
      const grid = document.querySelector<HTMLElement>('main [data-collection-grid]');
      const covers = grid === null ? [] : Array.from(grid.querySelectorAll<HTMLElement>('[data-grid-cover]')).map((el) => el.getBoundingClientRect());
      const firstRow = covers.filter((b) => Math.abs(b.top - covers[0].top) < 1);
      return {
        record: head?.dataset.record ?? '', aspect: Number(head?.dataset.aspect), clearing: Number(head?.dataset.clearing),
        box: box === null ? null : { width: box.width, height: box.height, left: box.left, right: box.right },
        svg: svg === null ? null : { width: svg.width, height: svg.height },
        ink: ink === null ? null : { width: ink.right - ink.left, height: ink.bottom - ink.top },
        column: list === null ? 0 : list.width, listTop: list?.top ?? 0, listLeft: list?.left ?? 0, listRight: list?.right ?? 0, head: headBox?.height ?? 0,
        columns: firstRow.length, cover: covers[0]?.width ?? 0,
      };
    });
  };

  const md = ['# Step 117: the head figure capped at 0.328 of the content column in height, on the real collection', '', 'Read-only, desktop Chromium, windows 1000 tall. Built to the drawing reading: the figure’s box is the drawing’s, and nothing reserves a square.', '',
    '“Occupied” is the width the figure’s box takes in the column. “Square side” is 0.328 of the column, the box a square reading would reserve; the difference is the paper that reading would add, half each side. “Marks” is the extent of the drawn forms inside the box.', '',
    '| view | window | column | figure drawn | occupied width | square side | paper a square would add | marks | head’s height | list’s top | capture |', '|---|---|---|---|---|---|---|---|---|---|---|'];
  for (const view of ['table', 'grid']) {
    for (const width of WIDTHS) {
      const m = await open(view, width);
      const file = `${view}-w${width}-${m.box === null ? 'no-figure' : `figure-${Math.round(m.box.width)}x${Math.round(m.box.height)}`}.png`;
      await page.screenshot({ path: join(OUT, file) });
      const side = m.column * FIGURE_FRACTION;
      md.push(`| ${view} | ${width} | ${r1(m.column)} | ${m.box === null ? 'none' : `**${r1(m.box.width)} × ${r1(m.box.height)}**`} | ${m.box === null ? '' : r1(m.box.width)} | ${m.box === null ? '' : r1(side)} | ${m.box === null ? '' : r1(side - m.box.width)} | ${m.ink === null ? '' : `${r1(m.ink.width)} × ${r1(m.ink.height)}`} | ${m.box === null ? '' : r1(m.head)} | **${r1(m.listTop)}** | ${file} |`);
    }
  }

  md.push('', '## The grid at its four- and five-cover changes', '', '| window | grid’s width | covers to a row | by 184n − 24 | cover | capture |', '|---|---|---|---|---|---|');
  for (const width of [1128, 1129, 1312, 1313]) {
    const m = await open('grid', width);
    const file = `grid-w${width}-${m.columns}-covers-of-${Math.round(m.cover)}.png`;
    await page.screenshot({ path: join(OUT, file) });
    md.push(`| ${width} | ${r1(m.listRight - m.listLeft)} | **${m.columns}** | ${gridColumns(m.listRight - m.listLeft)} | **${r1(m.cover)}** | ${file} |`);
  }
  writeFileSync(join(OUT, 'head-cap-117.md'), `${md.join('\n')}\n`);
});
