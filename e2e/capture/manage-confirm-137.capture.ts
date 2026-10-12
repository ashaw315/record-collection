import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from '@playwright/test';
import { POINTERS, pointerIs } from '../hit-area';
import { login } from '../sign-in';
import { wholePage } from '../whole-page';

/**
 * Step 137's capture: manage's open row with a change in it, asked whether
 * to discard, at 320 and 390 under each pointer.
 *
 * On the test database: the state is reached by opening a row and typing,
 * and the sheets on the real collection press nothing but section names.
 * Nothing is saved here either; the store is made through the API and
 * removed.
 *
 * Run with CAPTURE=1 --project=capture.
 */
const OUT = join('docs', 'captures', 'manage-confirm-137');

test('manage’s open row asked about its changes, under each pointer', async ({ browser }) => {
  test.skip(process.env.CAPTURE !== '1', 'A capture tool: run with CAPTURE=1');
  test.setTimeout(300_000);
  mkdirSync(OUT, { recursive: true });
  const md = ['# Step 137: manage asks before a close that would lose a change', '', 'The test database, desktop Chromium, touch on for the coarse pointer. A store’s row opened, its city changed, and the row pressed again.', '', '| file | window | pointer | the line’s controls | each, wide × tall as drawn |', '|---|---|---|---|---|'];
  for (const pointer of POINTERS) {
    const context = await browser.newContext({ hasTouch: pointer === 'coarse', viewport: { width: 390, height: 844 } });
    const page = await context.newPage();
    await login(page);
    expect(await pointerIs(page)).toBe(pointer);
    const name = `A Shop To Capture ${Date.now().toString(36)}`;
    const made = await page.request.post('/api/stores', { data: { name, city: 'Leeds', country: 'UK' } });
    expect(made.status()).toBe(201);
    const { id } = (await made.json()) as { id: string };
    try {
      for (const width of [320, 390]) {
        await page.setViewportSize({ width, height: 844 });
        await page.goto('/manage');
        await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
        await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: 'Stores', exact: true }).click();
        const row = page.locator('[data-manage-list]:visible [data-manage-row]').filter({ hasText: name });
        await row.locator('[data-manage-open]').click();
        await row.getByLabel(`${name} city`, { exact: true }).fill('York');
        await row.locator('[data-manage-open]').click();
        const confirm = row.locator('[data-manage-confirm]');
        await expect(confirm).toBeVisible();
        await page.evaluate(() => document.fonts.ready);
        await page.waitForTimeout(400);
        const controls = await confirm.locator('button').evaluateAll((all) => all.map((b) => ({ text: (b.textContent ?? '').trim().toUpperCase(), box: `${Math.round(b.getBoundingClientRect().width)} × ${Math.round(b.getBoundingClientRect().height)}` })));
        const file = `manage-stores-confirm-w${width}-${pointer}-pointer.png`;
        await row.scrollIntoViewIfNeeded();
        await wholePage(page, join(OUT, file));
        md.push(`| ${file} | ${width} | ${pointer} | ${controls.map((c) => c.text).join(', ')} | ${controls.map((c) => c.box).join(', ')} |`);
      }
    } finally {
      await page.request.delete(`/api/stores/${id}`, { failOnStatusCode: false });
      await context.close();
    }
  }
  writeFileSync(join(OUT, 'manage-confirm-137.md'), `${md.join('\n')}\n`);
});
