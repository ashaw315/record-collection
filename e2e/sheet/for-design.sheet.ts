import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test, type Page } from '@playwright/test';
import { pointerIs } from '../hit-area';
import { login } from './login';

/**
 * One folder for Design, who cannot read the repository and sees only what
 * Adam attaches: the want list (both views, the Acquired one empty) and
 * stats at 390 and 1280, and each section of manage at 390 and 320, as
 * built, on the real collection.
 *
 * One pointer per width, the one a reader at that width has: a phone's
 * finger at 390 and 320, a laptop's mouse at 1280. So no screen is in the
 * folder twice at one width, and each file's name says which it is.
 *
 * Read-only. Only manage's section names are pressed, which change what is
 * shown and write nothing.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'for-design');

async function settle(page: Page) {
  await page.locator('main, h1').first().waitFor({ timeout: 60_000 });
  await page.waitForLoadState('load');
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(600);
}

test('the want list, stats and manage, one pointer per width', async ({ browser }) => {
  mkdirSync(OUT, { recursive: true });
  const md = ['# For Design: the want list, stats and manage, as built, on the real collection', '', 'Read-only, desktop Chromium at each width. One pointer per width: touch on at 390 and 320 (a phone, a coarse pointer, where the 44 floor applies) and off at 1280 (a laptop, a fine pointer, where controls keep their drawn size). “Page” is the page’s height, and for manage how wide it scrolls.', '',
    '| file | screen | window | pointer | page |', '|---|---|---|---|---|'];
  for (const [pointer, widths] of [['coarse', [390, 320]], ['fine', [1280]]] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width: widths[0], height: 844 } });
    const page = await context.newPage();
    await login(page);
    if ((await pointerIs(page)) !== pointer) throw new Error(`the page was to have a ${pointer} pointer and has ${await pointerIs(page)}`);
    for (const width of widths) {
      await page.setViewportSize({ width, height: 844 });
      /* 320 is asked for on manage alone. */
      for (const [slug, name, path] of width === 320 ? [] : [['want-list', 'Want list', '/want-list'], ['want-list-acquired-empty', 'Want list, the Acquired view, empty', '/want-list?acquired=true'], ['stats', 'Stats', '/stats']] as const) {
        await page.goto(path);
        await settle(page);
        const height = await page.evaluate(() => document.documentElement.scrollHeight);
        const file = `${slug}-w${width}-${pointer}-pointer-h${height}.png`;
        await page.screenshot({ path: join(OUT, file), fullPage: true });
        md.push(`| ${file} | ${name} | ${width} | ${pointer} | ${height} tall |`);
      }
      if (pointer === 'fine') continue;
      await page.goto('/manage');
      await settle(page);
      const names = page.locator('nav[aria-label="Resource"] button');
      const count = await names.count();
      for (let i = 0; i < count; i += 1) {
        await names.nth(i).click();
        await page.waitForTimeout(400);
        const name = ((await names.nth(i).textContent()) ?? String(i)).trim();
        const scrolls = await page.evaluate(() => document.documentElement.scrollWidth);
        const slug = `manage-${name.toLowerCase().replace(/[^a-z]+/g, '-')}-w${width}-${pointer}-pointer-page${scrolls}`;
        await page.screenshot({ path: join(OUT, `${slug}-first-view.png`) });
        /* The whole page at the width it scrolls to, so nothing is cut at the window's edge. */
        await page.setViewportSize({ width: Math.max(width, scrolls), height: 844 });
        await page.screenshot({ path: join(OUT, `${slug}-whole.png`), fullPage: true });
        await page.setViewportSize({ width, height: 844 });
        md.push(`| ${slug}-first-view.png | Manage, ${name}: what the window shows | ${width} | ${pointer} | scrolls to ${scrolls} wide |`);
        md.push(`| ${slug}-whole.png | Manage, ${name}: the whole page, as wide as it scrolls | ${width} | ${pointer} | scrolls to ${scrolls} wide |`);
      }
    }
    await context.close();
  }
  writeFileSync(join(OUT, 'README.md'), `${md.join('\n')}\n`);
});
