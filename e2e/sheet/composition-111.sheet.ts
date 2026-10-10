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

/*
  Two measurements the coordinator asked for before the batch gate (10
  Oct), numbers and no change: what the figure does at 768, where the width
  cannot hold it at the block's height; and the narrowest face of a solid
  at the width where the solids first draw and one below it.
*/
test('the figure’s edges at 768, and a solid’s faces where the solids first draw', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const edges = (p: Page) =>
    p.evaluate(() => {
      const r3 = (n: number) => Math.round(n * 1000) / 1000;
      const host = document.querySelector<HTMLElement>('[data-heading-figure]') as HTMLElement;
      const r = host.getBoundingClientRect();
      const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-sort-control], [data-filter-trigger]')).map((l) => l.getBoundingClientRect());
      const list = (document.querySelector('main [data-collection-table] table') as HTMLElement).getBoundingClientRect();
      const still = host.querySelector<SVGSVGElement>('[data-testid="construction-still"]');
      let construction: { width: number; height: number; unitWidth: number; unitHeight: number } | null = null;
      if (still !== null) { const m = (still.ownerSVGElement as SVGSVGElement).getScreenCTM() as DOMMatrix; const w = Number(still.getAttribute('width')); const h = Number(still.getAttribute('height')); construction = { width: r3(w * m.a), height: r3(h * m.d), unitWidth: w, unitHeight: h }; }
      const solids = Array.from(host.querySelectorAll('[data-solid]')).map((g) => ({ width: r3(g.getBoundingClientRect().width), height: r3(g.getBoundingClientRect().height), faces: Array.from(g.querySelectorAll('polygon')).map((poly) => ({ face: poly.getAttribute('data-face'), width: r3(poly.getBoundingClientRect().width), height: r3(poly.getBoundingClientRect().height) })) }));
      return { drawn: host.getAttribute('data-drawn') === 'true', top: r3(r.top), foot: r3(r.bottom), left: r3(r.left), right: r3(r.right), width: r3(r.width), height: r3(r.height), blockTop: r3(Math.min(...lines.map((l) => l.top))), blockFoot: r3(Math.max(...lines.map((l) => l.bottom))), columnRight: r3(Math.max(...lines.map((l) => l.right))), contentRight: r3(list.right), construction, solids };
    });
  const md = ['# Two measurements (10 Oct), on the real collection', '', 'Read-only, desktop Chromium, the table. To a thousandth of a pixel.', '', '## The figure at 768', ''];
  await open(page, 'table', 768);
  const at768 = await edges(page);
  md.push('```json', JSON.stringify(at768, null, 1), '```', '', '## A solid’s faces', '', '| window | solids drawn | a solid, wide × tall | base face, wide | shade face, wide | top face, wide | narrowest |', '|---|---|---|---|---|---|---|');
  for (const width of [1440, 1024, 900, 840, 830, 825, 824, 823, 822, 821, 820]) {
    await open(page, 'table', width);
    const r = await edges(page);
    const solid = r.solids[0];
    if (solid === undefined) { md.push(`| ${width} | 0 | | | | | |`); continue; }
    const w = (name: string) => solid.faces.find((f) => f.face === name)?.width ?? NaN;
    md.push(`| ${width} | ${r.solids.length} | ${solid.width} × ${solid.height} | ${w('base')} | ${w('shade')} | ${w('top')} | ${Math.min(...solid.faces.map((f) => f.width))} |`);
  }
  writeFileSync(join(OUT, 'composition-111-two-measurements.md'), `${md.join('\n')}\n`);
});
