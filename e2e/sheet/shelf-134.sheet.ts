import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { pointerIs } from '../hit-area';
import { wholePage } from '../whole-page';
import { login } from './login';

/**
 * Step 134, for Adam: what a bare `/` draws on the real collection either
 * side of the shelf's 1044, under each pointer. Read-only. The file names
 * carry the width, the pointer and the view that was drawn, read from the
 * page and not assumed.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'shelf-134');

test('the collection as each window opens it', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 134: the shelf where it is offered, the grid where it is not', '', 'A bare `/` on the real collection, read-only, desktop Chromium, touch on for the coarse pointer.', '', '| width | pointer | drawn | view names | address after | file |', '|---|---|---|---|---|---|'];
  for (const [pointer, widths] of [['fine', [1440, 1044, 1043, 390]], ['coarse', [1440, 1280, 390]]] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    await login(page);
    if ((await pointerIs(page)) !== pointer) throw new Error(`the page was to have a ${pointer} pointer and has ${await pointerIs(page)}`);
    for (const width of widths) {
      await page.setViewportSize({ width, height: width < 600 ? 844 : 900 });
      await page.goto('/');
      await page.waitForLoadState('load');
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(2500);
      const m = await page.evaluate(() => {
        const shows = (el: Element | null) => el !== null && el.getClientRects().length > 0;
        return {
          drawn: [shows(document.querySelector('[data-shelf-offered]')) ? 'shelf' : null, shows(document.querySelector('[data-collection-grid]')) ? 'grid' : null].filter((v) => v !== null).join('+'),
          names: [...document.querySelectorAll('[data-view-name]')].filter(shows).map((el) => (el.textContent ?? '').trim().toUpperCase()).join(' '),
          address: location.pathname + location.search,
        };
      });
      const file = `collection-w${width}-${pointer}-pointer-draws-${m.drawn}.png`;
      await wholePage(page, join(OUT, file));
      md.push(`| ${width} | ${pointer} | ${m.drawn} | ${m.names} | \`${m.address}\` | ${file} |`);
    }
    await context.close();
  }
  writeFileSync(join(OUT, 'shelf-134.md'), `${md.join('\n')}\n`);
});
