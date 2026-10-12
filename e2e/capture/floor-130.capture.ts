import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { NO_SCROLL_HEIGHT } from '../../src/app/records/[id]/band-geometry';
import { POINTERS, pointerIs } from '../hit-area';
import { readSeventeen } from '../seventeen';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 130's captures, for Design to ratify: the drawn changes it made
 * under a coarse pointer on screens that are closed or ruled. A record's
 * page, whose image file field and journal date field are 44 in the box
 * from 34 (their labels are not drawn, so no label makes up the
 * difference), and the shelf's rail, whose three view names are 44 apart
 * from 42. Each beside the same screen under a fine pointer, unchanged.
 *
 * On the test database: a record's page is not opened on the real
 * collection. Whole pages by `wholePage`, not `fullPage`, which draws the
 * fine pointer's page.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'floor-130');

test('a record’s page and the shelf’s rail under each pointer', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 130’s drawn changes, under each pointer', '', 'The test database, desktop Chromium, touch on for the coarse pointer.', '', '| file | screen | window | pointer | image file field | journal date field | view names apart |', '|---|---|---|---|---|---|---|'];
  for (const pointer of POINTERS) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width: 1280, height: NO_SCROLL_HEIGHT } });
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    for (const width of [390, 1280]) {
      await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
      await page.goto(`/records/${readSeventeen()[0]?.id ?? ''}`);
      await page.locator('#image-file').waitFor({ state: 'attached' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(800);
      const [file, date] = await page.evaluate(() => ['image-file', 'entry-date'].map((id) => (document.getElementById(id) as HTMLElement).getBoundingClientRect().height));
      const name = `record-page-w${width}-${pointer}-pointer-file${file}-date${date}.png`;
      await wholePage(page, join(OUT, name));
      md.push(`| ${name} | a record’s page | ${width} | ${pointer} | ${file} | ${date} | |`);
    }
    await page.setViewportSize({ width: 1280, height: NO_SCROLL_HEIGHT });
    await page.goto('/?view=shelf');
    await page.locator('[data-seat]').first().waitFor();
    await page.waitForTimeout(800);
    const pitch = await page.evaluate(() => { const tops = Array.from(document.querySelectorAll('[data-testid="wall-rail"] ul a')).map((a) => a.getBoundingClientRect().top); return (tops[1] ?? 0) - (tops[0] ?? 0); });
    const name = `shelf-rail-w1280-${pointer}-pointer-names${pitch}apart.png`;
    await page.screenshot({ path: join(OUT, name) });
    md.push(`| ${name} | the shelf, its rail at the left | 1280 | ${pointer} | | | ${pitch} |`);
    await context.close();
  }
  writeFileSync(join(OUT, 'floor-130.md'), `${md.join('\n')}\n`);
});
