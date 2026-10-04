import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * Step 75: the not-found page at 390, 1000, 1440 and 1920, from the real
 * app, read-only. Two ways in -- a path no route matches and a dead record
 * link -- each named by the figures that differ: the header's height and
 * the response status.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'not-found');
const WAYS: ReadonlyArray<readonly [string, string]> = [
  ['unknown-path', '/no-such-screen'],
  ['dead-record', '/records/00000000-0000-4000-8000-000000000000'],
];

test('the not-found page at four widths', async ({ page }) => {
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const manifest: unknown[] = [];
  for (const [name, path] of WAYS) {
    for (const width of [390, 1000, 1440, 1920]) {
      await page.setViewportSize({ width, height: 400 });
      const response = await page.goto(path);
      await page.locator('[data-testid="not-found-line"]').waitFor({ timeout: 30_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const m = await page.evaluate(() => ({
        header: Math.round((document.querySelector('[data-app-nav]') as HTMLElement).getBoundingClientRect().height),
        line: (document.querySelector('[data-testid="not-found-line"]')?.textContent ?? '').trim(),
      }));
      const status = response?.status() ?? 0;
      const file = `not-found-${name}-${width}-h${m.header}-s${status}.png`;
      await page.screenshot({ path: join(OUT, file) });
      manifest.push({ way: name, path, width, status, headerHeight: m.header, line: m.line, file });
    }
  }
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
});
