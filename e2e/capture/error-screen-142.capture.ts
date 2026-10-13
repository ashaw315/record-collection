import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 142's captures, as Design asked: the error screen "at 390 coarse and
 * 1280 fine". Reached on `/error-probe`, a page that throws while a cookie
 * says so. The bare fallback beside it is the probe's stand-in
 * (`?bare=1`): the same body `global-error.tsx` draws, which a browser
 * cannot reach without the root layout failing. The table says which is
 * which.
 *
 * The pointer is taken off the page before each picture; a folder that
 * exists is not replaced unless `CAPTURE_REPLACE=1` says so.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'error-screen-142');

test('the error screen under the header, and its bare fallback, at 390 coarse and 1280 fine', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'error-screen-142.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds a capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 142: the error screen', '', 'The test database, desktop Chromium, touch on for the coarse pointer. Reached on a page that throws on purpose; no real page fails on demand.', '', '| file | what | window | pointer | heading | controls, each wide × tall |', '|---|---|---|---|---|---|'];
  for (const [width, pointer] of [[390, 'coarse'], [1280, 'fine']] as const) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(30_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    /* The bare fallback is `global-error.tsx` itself: the probe's failure under a second cookie, which `error.tsx` rethrows in development (13 Oct, after the probe's stand-in). */
    for (const [slug, what, global] of [['error-screen', 'a page that failed, under the app’s header (`error.tsx`)', false], ['error-bare-fallback', 'the bare fallback, `global-error.tsx` itself: the same body with no header, its own document', true]] as const) {
      const origin = new URL(page.url()).origin;
      await context.clearCookies({ name: 'error-probe-global' });
      await context.addCookies([{ name: 'error-probe', value: 'throw', url: origin }, ...(global ? [{ name: 'error-probe-global', value: '1', url: origin }] : [])]);
      await page.goto('/error-probe');
      if (global) await page.locator('[data-global-error]').waitFor();
      await page.getByRole('heading', { level: 1, name: 'Something went wrong.' }).waitFor();
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.mouse.move(1, 1);
      await page.waitForTimeout(300);
      const m = await page.evaluate(() => ({ heading: getComputedStyle(document.querySelector('main h1') as HTMLElement).fontSize, controls: Array.from(document.querySelectorAll<HTMLElement>('main button, main a')).map((el) => `${(el.textContent ?? '').trim().toUpperCase()} ${Math.round(el.getBoundingClientRect().width)} × ${Math.round(el.getBoundingClientRect().height)}`) }));
      const file = `${slug}-w${width}-${pointer}-pointer.png`;
      await wholePage(page, join(OUT, file));
      md.push(`| ${file} | ${what} | ${width} | ${pointer} | ${m.heading} | ${m.controls.join(', ')} |`);
    }
    await context.close();
  }
  writeFileSync(join(OUT, 'error-screen-142.md'), `${md.join('\n')}\n`);
});
