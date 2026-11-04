import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 166, §64: the two years on the record form, "provisional until built
 * and captured, at 1440 × 900 and at 390". The new form with Everything else
 * opened, whole pages, and the pair alone at the viewport's width. Run with
 * CAPTURE=1 --project=capture; replaced only with CAPTURE_REPLACE=1.
 */
const OUT = join('docs', 'captures', 'years-166');
const WINDOWS = [[1440, 900, 'fine'], [390, 844, 'coarse']] as const;

test('the two years on the new record form, at 1440 × 900 fine and 390 × 844 coarse', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'years-166.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds the capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 166: §64, the two years on the record form', '', 'The test database, desktop Chromium, touch on for the coarse pointer; the new form with Everything else opened. The whole page, and the pair alone.', '', '| file | what | width | pointer | height |', '|---|---|---|---|---|'];
  for (const [width, height, pointer] of WINDOWS) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    await page.goto('/records/new');
    await page.locator('form[data-hydrated="true"]').waitFor();
    const everythingElse = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Everything else' }) }).first();
    if (!(await everythingElse.evaluate((el) => (el as HTMLDetailsElement).open))) {
      await everythingElse.locator('summary').first().click();
      await expect(everythingElse).toHaveAttribute('open', '');
    }
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.mouse.move(1, 1);
    await page.waitForTimeout(300);
    const pageHeight = await page.evaluate(() => document.documentElement.scrollHeight);
    const whole = `form-w${width}-${pointer}-h${pageHeight}.png`;
    await wholePage(page, join(OUT, whole));
    md.push(`| ${whole} | the new form, Everything else open | ${width} | ${pointer} | ${pageHeight} |`);
    /* The pair alone: its box, the width of the form's measure, so the two fields and their hints read at size. */
    const pair = page.locator('[data-year-pair]');
    const box = await pair.boundingBox();
    if (box === null) throw new Error('the year pair has no box');
    const file = `pair-w${width}-${pointer}-h${Math.round(box.height)}.png`;
    await pair.screenshot({ path: join(OUT, file) });
    md.push(`| ${file} | the pair alone, Release year and Year pressed ${width >= 640 ? 'side by side' : 'one beneath the other'} | ${width} | ${pointer} | ${Math.round(box.height)} |`);
    await context.close();
  }
  writeFileSync(join(OUT, 'years-166.md'), `${md.join('\n')}\n`);
});
