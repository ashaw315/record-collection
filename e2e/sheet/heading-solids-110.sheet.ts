import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { login } from './login';

/**
 * Step 110's figures, read-only on the real collection: the heading's
 * figure with its row of solids on the table and the grid, for Adam, and
 * what §T.6 asks the build step to report: the figure's size at 1920,
 * 1440, 1024 and 768, and the solids-to-ink ratio.
 *
 * Nothing is pressed. Desktop Chromium, which is not Adam's browser.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'heading-solids-110');
const WIDTHS = [1920, 1440, 1024, 768, 390];

const read = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-heading-figure]');
    if (host === null) return null;
    const r = host.getBoundingClientRect();
    const r1 = (n: number) => Math.round(n * 10) / 10;
    const drawing = host.querySelector<SVGSVGElement>('[data-heading-drawing]');
    const vb = drawing?.getAttribute('viewBox')?.split(' ').map(Number) ?? null;
    const figureHeight = Number(host.getAttribute('data-air-figure') ?? 0);
    return { drawn: host.getAttribute('data-drawn') === 'true', record: host.getAttribute('data-record'), clearing: r1(Number(host.getAttribute('data-clearing'))), left: r1(r.left), top: r1(r.top), width: r1(r.width), height: r1(r.height), figureHeight: r1(figureHeight), figureWidth: vb === null ? 0 : r1(figureHeight * (vb[2] / vb[3])), solids: host.querySelectorAll('[data-solid]').length };
  });

async function open(page: Page, view: string, width: number, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?view=${view}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 60_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-heading-figure][data-measured="true"]').waitFor({ state: 'attached', timeout: 30_000 });
  await page.waitForTimeout(600);
}

test('the heading’s figure on the table and the grid', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md: string[] = ['# The heading’s figure with its solids (step 110), on the real collection', '', 'The construction in ink with its row of solids. Read-only, desktop Chromium. Where the figure is not drawn, the height given is the one the whole figure would have had in the air.'];
  const all: unknown[] = [];
  for (const view of ['table', 'grid']) {
    md.push('', '| view | window | drawn | air | the whole figure’s height in it | figure as drawn | solids | clearing height |', '|---|---|---|---|---|---|---|---|');
    for (const width of WIDTHS) {
      await open(page, view, width);
      const r = await read(page);
      all.push({ view, width, ...r });
      if (r === null) continue;
      await page.screenshot({ path: join(OUT, `figure-${view}-${String(width).padStart(4, '0')}x900-${r.drawn ? `h${Math.round(r.figureHeight)}` : 'none'}.png`) });
      md.push(`| ${view} | ${width} | ${r.drawn ? 'yes' : 'no'} | ${r.drawn ? `${r.width} × ${r.height}` : ''} | ${r.figureHeight} | ${r.drawn ? `${r.figureWidth} × ${r.figureHeight}` : 'none'} | ${r.drawn ? r.solids : ''} | ${r.clearing} |`);
    }
    /* The width at which it appears: the narrowest window that draws it, by halving between one that does not and one that does. */
    let lo = 390;
    let hi = 1920;
    while (hi - lo > 1) {
      const mid = Math.floor((lo + hi) / 2);
      await open(page, view, mid);
      if ((await read(page))?.drawn === true) hi = mid; else lo = mid;
    }
    md.push('', `**${view}: the figure appears at ${hi} wide** and not at ${lo}.`, '');
  }
  writeFileSync(join(OUT, 'heading-solids-110.md'), `${md.join('\n')}\n`);
  writeFileSync(join(OUT, 'heading-solids-110.json'), `${JSON.stringify(all, null, 1)}\n`);
});
