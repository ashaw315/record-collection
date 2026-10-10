import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { login } from './login';

/**
 * Steps 111 and 112, read-only on the real collection: the table's and the
 * grid's composition, for Adam, and what the two steps ask to be reported.
 * 111: "at 1920, 1440, 1024 and 768 on both views: the figure's size, its
 * left edge, the block's height, and the width at which the figure first
 * appears." 112: "the construction's size, the solid's width, and whether
 * solids draw."
 *
 * It replaces the sheets for steps 103d and 110, whose figure stood in the
 * air and read attributes the page no longer carries; their captures stay
 * as the record of what those steps drew.
 *
 * Nothing is pressed. Desktop Chromium, which is not Adam's browser.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'composition-111');
const WIDTHS = [1920, 1440, 1024, 768, 390];

const read = (page: Page) =>
  page.evaluate(() => {
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const host = document.querySelector<HTMLElement>('[data-heading-figure]');
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-sort-control], [data-filter-trigger]')).map((l) => l.getBoundingClientRect());
    const list = document.querySelector<HTMLElement>('main [data-collection-table] table, main [data-collection-grid]');
    if (host === null || list === null || lines.length === 0) return null;
    const r = host.getBoundingClientRect();
    const still = host.querySelector<SVGSVGElement>('[data-testid="construction-still"]');
    let construction = '';
    if (still !== null) { const m = (still.ownerSVGElement as SVGSVGElement).getScreenCTM() as DOMMatrix; construction = `${r1(Number(still.getAttribute('width')) * m.a)} × ${r1(Number(still.getAttribute('height')) * m.d)}`; }
    const solids = Array.from(host.querySelectorAll('[data-solid]'));
    const blockTop = Math.min(...lines.map((l) => l.top));
    const blockFoot = Math.max(...lines.map((l) => l.bottom));
    return {
      drawn: host.getAttribute('data-drawn') === 'true', clearing: r1(Number(host.getAttribute('data-clearing'))),
      figure: `${r1(r.width)} × ${r1(r.height)}`, left: r1(r.left), top: r1(r.top), foot: r1(r.bottom), right: r1(r.right),
      construction, solids: solids.length, solidWidth: solids.length === 0 ? null : r1(solids[0].getBoundingClientRect().width),
      lines: lines.length, blockTop: r1(blockTop), blockFoot: r1(blockFoot), block: r1(blockFoot - blockTop), listTop: r1(list.getBoundingClientRect().top), listRight: r1(list.getBoundingClientRect().right),
    };
  });

async function open(page: Page, view: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?view=${view}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-heading-figure][data-measured="true"]').waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(600);
}

test('the table’s and the grid’s composition', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md: string[] = ['# The table’s and the grid’s composition (steps 111 and 112), on the real collection', '', 'Read-only, desktop Chromium. Positions are from the window’s left and top with the page unscrolled.'];
  for (const view of ['table', 'grid']) {
    md.push('', `## ${view}`, '', '| window | block, top to foot | block’s height | list starts | content’s right | figure | its left | its foot | its right | construction | solids | a solid’s width |', '|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const width of WIDTHS) {
      await open(page, view, width);
      const r = await read(page);
      if (r === null) continue;
      await page.screenshot({ path: join(OUT, `composition-${view}-${String(width).padStart(4, '0')}x900-${r.drawn ? `h${Math.round(Number(r.figure.split(' × ')[1]))}` : 'none'}.png`) });
      md.push(`| ${width} | ${r.blockTop} to ${r.blockFoot} | ${r.block} | ${r.listTop} | ${r.listRight} | ${r.drawn ? r.figure : 'none'} | ${r.drawn ? r.left : ''} | ${r.drawn ? r.foot : ''} | ${r.drawn ? r.right : ''} | ${r.construction} | ${r.drawn ? r.solids : ''} | ${r.solidWidth ?? ''} |`);
    }
    /* The width at which it first appears: the narrowest window that draws it, by halving between one that does not and one that does. */
    let lo = 390;
    let hi = 1920;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      await open(page, view, mid);
      if ((await read(page))?.drawn === true) hi = mid; else lo = mid;
    }
    md.push('', `**${view}: the figure first appears at ${hi} wide** and not at ${lo}.`);
    if (view === 'table') {
      /* And the solids: the narrowest window at which they draw. */
      let low = hi;
      let high = 1920;
      await open(page, view, low);
      if (((await read(page))?.solids ?? 0) === 0) {
        while (high - low > 1) { const mid = Math.floor((low + high) / 2); await open(page, view, mid); if (((await read(page))?.solids ?? 0) > 0) high = mid; else low = mid; }
        md.push(`**table: the solids first draw at ${high} wide** and not at ${low}.`);
      } else md.push(`**table: the solids draw from where the figure does.**`);
    }
  }
  writeFileSync(join(OUT, 'composition-111.md'), `${md.join('\n')}\n`);
});
