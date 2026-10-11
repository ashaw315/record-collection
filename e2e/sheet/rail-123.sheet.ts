import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * Step 123, §T.1: where the shelf rail's first line lands, and that its
 * right edge did not move, above the shelf's own fork. On the real
 * collection, read-only; nothing is pressed.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'rail-123');
const r1 = (n: number) => String(Math.round(n * 10) / 10);

test('the shelf rail’s first line and its edges', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# Step 123: the shelf rail’s inset, on the real collection', '', 'Read-only, desktop Chromium, windows 900 tall, the shelf above its own fork.', '',
    '| window | wordmark’s left | SEARCH’s left | field, left to right | view names’ left | rail, left to right | padding | capture |', '|---|---|---|---|---|---|---|---|'];
  for (const width of [1920, 1440, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    await page.goto('/');
    await page.getByTestId('wall').waitFor({ state: 'attached', timeout: 60_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(1200);
    const m = await page.evaluate(() => {
      const rail = document.querySelector('[data-testid="wall-rail"]') as HTMLElement;
      const box = (el: Element | null) => el?.getBoundingClientRect() ?? null;
      const style = getComputedStyle(rail);
      return { wordmark: box(document.querySelector('[data-wordmark]'))?.left ?? -1, label: box(rail.querySelector('label[for="rail-search"]'))?.left ?? -1, field: box(rail.querySelector('#rail-search')), name: box(rail.querySelector('ul[aria-label="View"] a'))?.left ?? -1, rail: box(rail), padding: `${style.paddingLeft}, ${style.paddingRight}` };
    });
    const file = `shelf-w${width}-rail-first-line-${Math.round(m.label)}.png`;
    await page.screenshot({ path: join(OUT, file) });
    md.push(`| ${width} | ${r1(m.wordmark)} | **${r1(m.label)}** | ${m.field === null ? '' : `${r1(m.field.left)} to ${r1(m.field.right)}`} | ${r1(m.name)} | ${m.rail === null ? '' : `${r1(m.rail.left)} to **${r1(m.rail.right)}**`} | ${m.padding} | ${file} |`);
  }
  writeFileSync(join(OUT, 'rail-123.md'), `${md.join('\n')}\n`);
});
