import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from '@playwright/test';
import { login } from './login';

/**
 * **The covering menu's sheet (step 84): Collection and a record, closed and
 * open, at 390 and 320, and the short window at 390 by 240.** Read-only, from
 * the real app. Each capture is the whole viewport, because the panel runs to
 * its bottom edge and the closed shot beside it shows the page the panel
 * holds in place.
 *
 * Named by what differs: the window, the state, and for an open shot where
 * the list ends (`-list273`), which is where the last row's hairline sits on
 * open paper -- the thing §G.8 leaves to Adam's judgement.
 */
const OUT = process.env.SHEET_OUT ?? join('docs', 'captures', 'nav-menu-84');
const RECORD = process.env.HEADER_RECORD_ID ?? '';

test('the covering menu: Collection and a record, closed and open, and the short window', async ({ page }) => {
  if (RECORD === '') throw new Error('Set HEADER_RECORD_ID to a real id.');
  mkdirSync(OUT, { recursive: true });
  await login(page);
  const manifest: unknown[] = [];
  const shots: Array<[string, string, number, number]> = [
    ['collection', '/', 390, 844],
    ['collection', '/', 320, 844],
    ['record', `/records/${RECORD}`, 390, 844],
    ['record', `/records/${RECORD}`, 320, 844],
    ['collection', '/', 390, 240],
    ['record', `/records/${RECORD}`, 390, 240],
  ];
  for (const [name, path, width, height] of shots) {
    for (const openMenu of [false, true]) {
      await page.setViewportSize({ width, height });
      await page.goto(path);
      await page.locator('[data-app-nav]').waitFor({ timeout: 30_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await page.evaluate(() => document.fonts.ready);
      /* The record page is still growing at 1.2s as images arrive (4037 then 4110 at 390); a closed shot taken early reads as the page having grown when the menu opened. */
      await page.waitForTimeout(3000);
      if (openMenu) {
        await page.locator('[data-menu-control]').click();
        await page.locator('[data-menu-panel]').waitFor();
        await page.waitForTimeout(300);
      }
      const m = await page.evaluate(() => {
        const header = (document.querySelector('[data-app-nav]') as HTMLElement).getBoundingClientRect();
        const panel = document.querySelector('[data-menu-panel]') as HTMLElement | null;
        const last = document.querySelector('[data-menu-list] a:last-child') as HTMLElement | null;
        return {
          header: Math.round(header.height),
          panelTop: panel === null ? null : Math.round(panel.getBoundingClientRect().top),
          panelBottom: panel === null ? null : Math.round(panel.getBoundingClientRect().bottom),
          listEnds: last === null ? null : Math.round(last.getBoundingClientRect().bottom),
          listScrolls: panel === null ? null : panel.scrollHeight > panel.clientHeight,
          page: document.documentElement.scrollHeight,
        };
      });
      const file = `menu84-${name}-${String(width).padStart(4, '0')}x${height}-${openMenu ? `open-list${m.listEnds}` : 'closed'}-h${m.header}.png`;
      await page.screenshot({ path: join(OUT, file) });
      manifest.push({ screen: name, width, height, state: openMenu ? 'open' : 'closed', file, ...m });
      if (openMenu) await page.keyboard.press('Escape');
    }
  }
  writeFileSync(join(OUT, 'manifest.json'), `${JSON.stringify(manifest, null, 1)}\n`);
});
