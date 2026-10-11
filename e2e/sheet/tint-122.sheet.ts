import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * Step 122, for Adam: the want list's empty figure in the source record's
 * tint, on the one empty state the real collection shows (the Acquired
 * view). Look up's needs a search, which is a live call to Discogs, and is
 * not opened; it draws the same component.
 *
 * Read-only. Nothing is pressed.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'tint-122');
const r1 = (n: number) => String(Math.round(n * 10) / 10);

test('the want list’s empty figure in the source’s tint', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const md = ['# Step 122: the want list’s empty figure in the source’s tint, on the real collection', '', 'Read-only, desktop Chromium. The Acquired view, which is empty.', '',
    '| window | figure | the tint it names | fills drawn | capture |', '|---|---|---|---|---|'];
  for (const [width, height] of [[1440, 900], [390, 664], [320, 664]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto('/want-list?acquired=true');
    await page.locator('h1').first().waitFor({ timeout: 60_000 });
    await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const m = await page.evaluate(() => {
      const empty = document.querySelector<HTMLElement>('[data-want-list-empty]');
      const svg = empty?.querySelector('svg');
      if (empty === null || svg === null || svg === undefined) return null;
      const b = svg.getBoundingClientRect();
      return { width: b.width, height: b.height, tint: empty.querySelector<HTMLElement>('[data-tint]')?.dataset.tint ?? null, fills: [...new Set(Array.from(svg.querySelectorAll('polygon[data-face], circle')).map((el) => getComputedStyle(el).fill))] };
    });
    if (m === null) { md.push(`| ${width} × ${height} | the Acquired view is not empty, or draws no figure | | | |`); continue; }
    const file = `want-list-acquired-w${width}-tint-${(m.tint ?? 'none').replace('#', '') || 'ink'}.png`;
    await page.screenshot({ path: join(OUT, file) });
    md.push(`| ${width} × ${height} | ${r1(m.width)} × ${r1(m.height)} | ${m.tint === null ? 'none named' : m.tint === '' ? 'no cover: ink' : `\`${m.tint}\``} | ${m.fills.join(', ')} | ${file} |`);
  }
  writeFileSync(join(OUT, 'tint-122.md'), `${md.join('\n')}\n`);
});
