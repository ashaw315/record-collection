import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 139's captures, as Design asked: "Capture login at 390 coarse and
 * the dialog at 390 coarse and 1280 fine." Login twice, at rest and
 * refused, since the refusal's reserved slot is the other thing built on
 * that screen; and the want list's form at 1280, for Best dig's label.
 *
 * The test database. Plain names; the pointer is taken off the page
 * before each picture; a folder that exists is not replaced unless
 * `CAPTURE_REPLACE=1` says so.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'three-fixes-139');

test('login at the 18 and refused; the dialog in its one order; Best dig’s label at its head', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  if (existsSync(join(OUT, 'three-fixes-139.md')) && process.env.CAPTURE_REPLACE !== '1') throw new Error(`${OUT} already holds a capture. It is not replaced unless CAPTURE_REPLACE=1 says so`);
  test.setTimeout(600_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 139: three fixes', '', 'The test database, desktop Chromium, touch on for the coarse pointer.', '', '| file | screen | window | pointer | what it shows, measured |', '|---|---|---|---|---|'];

  for (const [width, pointer] of [[390, 'coarse'], [1280, 'fine']] as const) {
    /* Signed out, for the sign-in screen at 390. */
    if (width === 390) {
      const context = await browser.newContext({ hasTouch: true, viewport: { width, height: 844 } });
      context.setDefaultTimeout(20_000);
      const page = await context.newPage();
      await page.route('**/api/auth/login', (route) => route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ error: { message: 'Incorrect password', code: 'UNAUTHORIZED' } }) }));
      await page.goto('/login');
      await page.locator('form[data-hydrated="true"]').waitFor();
      /* The dev server's badge stands in the corner of the page and is not the app's. */
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      const read = () => page.evaluate(() => { const box = (selector: string) => (document.querySelector(selector) as HTMLElement).getBoundingClientRect(); return { left: box('h1').left, field: [box('#password').left, innerWidth - box('#password').right], tops: ['h1', '#password', 'form button'].map((selector) => Math.round(box(selector).top)) }; });
      const rest = await read();
      await page.mouse.move(1, 1);
      await page.evaluate(() => document.fonts.ready);
      await wholePage(page, join(OUT, `login-w${width}-${pointer}-pointer.png`));
      md.push(`| login-w${width}-${pointer}-pointer.png | /login, at rest | ${width} | ${pointer} | heading at ${rest.left}; field ${rest.field[0]} from the left, ${rest.field[1]} from the right; heading, field, button at ${rest.tops.join(', ')} |`);
      await page.locator('#password').pressSequentially('not-the-password');
      /* The form's submit, by its type: this is a refusal answered by a stub, and the button's name is the sign-in helper's. */
      await page.locator('form button[type=submit]').click();
      await expect(page.locator('#password-error')).toHaveText(/\S/);
      await expect(page.locator('form button[type=submit]')).toBeEnabled();
      const refused = await read();
      await page.mouse.move(1, 1);
      await wholePage(page, join(OUT, `login-refused-w${width}-${pointer}-pointer.png`));
      md.push(`| login-refused-w${width}-${pointer}-pointer.png | /login, a password refused (the answer stubbed) | ${width} | ${pointer} | heading, field, button at ${refused.tops.join(', ')}: ${JSON.stringify(refused.tops) === JSON.stringify(rest.tops) ? 'where they were' : '**MOVED**'} |`);
      await context.close();
    }

    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width, height: 844 } });
    context.setDefaultTimeout(20_000);
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    const post = async (path: string, data: unknown) => { const response = await page.request.post(path, { data, failOnStatusCode: false }); expect(response.status(), path).toBe(201); return ((await response.json()) as { id: string }).id; };
    const artist = await post('/api/artists', { name: 'GBH' });
    const item = await post('/api/want-list', { title: 'Leather, Bristles, Studs and Acne', artistId: artist, priority: 2 });
    try {
      await page.goto('/want-list');
      await page.getByRole('listitem').filter({ hasText: 'Leather, Bristles, Studs and Acne' }).getByRole('button', { name: 'Delete' }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.locator('[data-slot="dialog-content"]').evaluate((el) => Promise.all(el.getAnimations().map((animation) => animation.finished)));
      await page.mouse.move(1, 1);
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(300);
      const buttons = await page.locator('[data-slot="dialog-footer"] button').evaluateAll((all) => all.map((button) => { const box = button.getBoundingClientRect(); return { name: (button.textContent ?? '').trim(), top: Math.round(box.top), bottom: Math.round(box.bottom), left: Math.round(box.left), right: Math.round(box.right), height: Math.round(box.height) }; }));
      const [first, second] = buttons;
      const stacked = first !== undefined && second !== undefined && second.top >= first.bottom;
      const file = `dialog-w${width}-${pointer}-pointer.png`;
      await page.screenshot({ path: join(OUT, file) });
      md.push(`| ${file} | the dialog, from a want-list row’s Delete | ${width} | ${pointer} | ${buttons.map((button) => button.name).join(' then ')}; ${stacked ? `stacked, ${(second?.top ?? 0) - (first?.bottom ?? 0)} apart` : `side by side, ${(second?.left ?? 0) - (first?.right ?? 0)} apart`}; each ${buttons.map((button) => button.height).join(' and ')} tall |`);
      await page.keyboard.press('Escape');

      if (width === 1280) {
        await page.goto(`/want-list/${item}/edit`);
        await page.locator('form').first().waitFor();
        await page.mouse.move(1, 1);
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(300);
        const head = await page.evaluate(() => { const label = document.querySelector('label[for="bestDigNotes"]') as HTMLElement; const box = document.getElementById('bestDigNotes') as HTMLElement; const range = document.createRange(); range.selectNodeContents(label); const first = range.getClientRects()[0] ?? label.getBoundingClientRect(); return [Math.round(first.top - box.getBoundingClientRect().top), Math.round(box.getBoundingClientRect().height)]; });
        await wholePage(page, join(OUT, `want-list-edit-w${width}-${pointer}-pointer.png`));
        md.push(`| want-list-edit-w${width}-${pointer}-pointer.png | /want-list/[id]/edit | ${width} | ${pointer} | Best dig’s label’s first line starts ${head[0]} below its box’s top, in a box ${head[1]} tall |`);
      }
    } finally {
      await page.request.delete(`/api/want-list/${item}`, { failOnStatusCode: false });
      await page.request.delete(`/api/artists/${artist}`, { failOnStatusCode: false });
      await context.close();
    }
  }
  writeFileSync(join(OUT, 'three-fixes-139.md'), `${md.join('\n')}\n`);
});
