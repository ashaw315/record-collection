import type { Page } from '@playwright/test';
import { pointerIs } from './hit-area';

/**
 * **The whole page as a picture, under the pointer the page has.**
 *
 * Not `fullPage: true`: Chromium's full-page screenshot drops the touch
 * emulation while it draws, so a coarse pointer's page is drawn as a fine
 * one's on a sheet the coarse page's length (`test/repo/
 * coarse-captures.test.ts`). The window is made as tall as the page and
 * photographed as a window, which changes nothing, and the pointer is read
 * before and after: a picture taken under another pointer than the page had
 * is not returned as if it were.
 */
export async function wholePage(page: Page, path: string): Promise<void> {
  const before = await pointerIs(page);
  const size = page.viewportSize();
  if (size === null) throw new Error('wholePage: the page has no window size to restore');
  let height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height });
  /* A page that fills its window is as tall as the window it is given; read once more so the picture is the page and no more. */
  height = await page.evaluate(() => document.documentElement.scrollHeight);
  await page.setViewportSize({ width: size.width, height });
  await page.screenshot({ path });
  const after = await pointerIs(page);
  await page.setViewportSize(size);
  if (after !== before) throw new Error(`wholePage: the pointer was ${before} before the picture and ${after} after it`);
}
