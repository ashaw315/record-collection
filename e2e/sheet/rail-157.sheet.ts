import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { nearViewMinWidth } from '../../src/app/wall/view-fork';
import { login } from './login';

/**
 * Step 157, for Adam: the rail with the moods, ASK and SURPRISE ME at a short
 * window, where the control runs past the window's foot and the page scrolls
 * to ADD RECORD (§P.5, `P.5/control-must-fit`). The handoff's Provisionals
 * line: "640 is provisional, for Adam to judge from a capture. Captured at
 * 1274 by 640 and 1440 by 640, scrolled to the top and to ADD RECORD,
 * labelled by host." Both are the column host, the rail as a column beside
 * the near view. Read-only, on the real collection: nothing is pressed.
 *
 * Each file is named by the host, the window, and the scroll it was taken at
 * (`-s0` at the top, `-s<N>` with ADD RECORD in view), so the figure Adam
 * judges, how far the page scrolls, is in the name.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'rail-157');
const WIDTHS = [nearViewMinWidth(), 1440];
const HEIGHT = 640;

const measure = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element | null): el is HTMLElement => el !== null && (el as HTMLElement).getClientRects().length > 0;
    const rail = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wall-rail"]')).filter(drawn).find((el) => el.closest('[data-collection-band]') === null) ?? null;
    const control = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-control]')).filter(drawn).find((el) => rail?.contains(el)) ?? null;
    const add = rail === null ? null : Array.from(rail.querySelectorAll('a')).find((a) => /add record/i.test(a.textContent ?? '')) ?? null;
    const box = (el: Element | null) => (el === null ? null : (({ top, bottom }) => ({ top: top + window.scrollY, bottom: bottom + window.scrollY }))(el.getBoundingClientRect()));
    return { control: box(control), add: box(add), page: document.documentElement.scrollHeight, window: window.innerHeight, scrollY: window.scrollY };
  });

test('the rail at 640 tall, at the top and scrolled to ADD RECORD, on the real collection', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = [
    '# Step 157: the rail at 640 tall, on the real collection',
    '',
    'A bare `/`, the near view, read-only. The column host at both widths. Figures in the document’s coordinates.',
    '',
    '| host | window | control (top to bottom) | ADD RECORD (top to bottom) | page | scroll to ADD RECORD | files |',
    '|---|---|---|---|---|---|---|',
  ];
  for (const width of WIDTHS) {
    await page.setViewportSize({ width, height: HEIGHT });
    await page.goto('/');
    await page.locator('[data-wall-container]:not([data-unmeasured])').waitFor({ timeout: 30_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1000);
    const top = await measure(page);
    const topFile = `rail-157-column-${width}x${HEIGHT}-s0.png`;
    await page.screenshot({ path: join(OUT, topFile) });
    const scrolled = await page.evaluate(() => {
      window.scrollTo(0, document.documentElement.scrollHeight);
      return window.scrollY;
    });
    await page.waitForTimeout(400);
    const end = await measure(page);
    const endFile = `rail-157-column-${width}x${HEIGHT}-s${Math.round(scrolled)}.png`;
    await page.screenshot({ path: join(OUT, endFile) });
    if (top.control === null || top.add === null) throw new Error(`the control or ADD RECORD was not found at ${width}×${HEIGHT}`);
    md.push(`| column | ${width}×${HEIGHT} | ${top.control.top.toFixed(1)} to ${top.control.bottom.toFixed(1)} | ${top.add.top.toFixed(1)} to ${top.add.bottom.toFixed(1)} | ${top.page} | ${scrolled.toFixed(0)} (ADD RECORD’s foot then at ${(end.add === null ? NaN : end.add.bottom - end.scrollY).toFixed(1)} in a ${HEIGHT} window) | ${topFile}, ${endFile} |`);
  }
  writeFileSync(join(OUT, 'rail-157.md'), `${md.join('\n')}\n`);
});
