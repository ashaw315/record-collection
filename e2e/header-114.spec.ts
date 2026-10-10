import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 114, §G.3: "The header runs the full window on every screen: the
 * wordmark at the 18 inset, the links and the slot at the far right."
 *
 * It was capped at 1152 and centred under a capped screen
 * (`G.3/header-screen-measure`), so the wordmark stood at 162 in a 1440
 * window and 402 in a 1920 one (measured 10 Oct), and step 113's sidebar,
 * whose content starts on the wordmark, could not stand under it.
 */
const INSET = 18;
const SCREENS: [string, string][] = [['the table', '/?view=table'], ['the shelf', '/'], ['the want list', '/want-list']];

async function open(page: Page, path: string, width: number) {
  await page.setViewportSize({ width, height: 800 });
  await page.goto(path);
  await page.locator('[data-wordmark]').waitFor();
  await page.evaluate(() => document.fonts.ready);
}

const reading = (page: Page) =>
  page.evaluate(() => {
    const ink = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
    const mark = document.querySelector('[data-wordmark]') as HTMLElement;
    const bar = document.querySelector('[data-app-nav]') as HTMLElement;
    const links = Array.from(document.querySelectorAll<HTMLElement>('[data-app-nav] nav[aria-label="Main"] a')).filter((a) => a.getClientRects().length > 0);
    const menu = document.querySelector<HTMLElement>('[data-app-nav] [data-menu-control]');
    const last = links.length > 0 ? ink(links[links.length - 1]).right : menu !== null && menu.getClientRects().length > 0 ? ink(menu).right : null;
    return { wordmark: ink(mark).left, bar: { left: bar.getBoundingClientRect().left, right: bar.getBoundingClientRect().right }, first: links.length > 0 ? ink(links[0]).left : null, last, window: document.documentElement.clientWidth };
  });

test.beforeEach(async ({ page }) => login(page));

for (const [name, path] of SCREENS) {
  /* Fails against the 1152 cap at 1440 and 1920: 162 and 402. Passes at 320 and 1024 before, where the window is inside the cap. */
  test(`${name}: the wordmark is 18 from the window’s left at 320, 1024, 1440 and 1920`, async ({ page }) => {
    for (const width of [320, 1024, 1440, 1920]) {
      await open(page, path, width);
      const r = await reading(page);
      expect(Math.abs(r.wordmark - INSET), `at ${width}: the wordmark’s left, ${r.wordmark}`).toBeLessThan(0.5);
      expect(r.bar, `at ${width}: the bar is the window’s`).toEqual({ left: 0, right: r.window });
    }
  });

  /*
    "The links and the slot at the far right" is read as the slot's place:
    the links follow the wordmark, as built and as Adam's wireframe draws
    them, and what stands at the row's right end is the slot on a record's
    page and the menu's control below 584. Fails against the cap at 1920
    only for a screen whose right end is occupied; here it holds the
    control's box to the window's inset.
  */
  test(`${name}: at 390 the menu’s control ends 18 from the window’s right`, async ({ page }) => {
    await open(page, path, 390);
    const r = await page.evaluate(() => { const c = (document.querySelector('[data-app-nav] [data-menu-control]') as HTMLElement).getBoundingClientRect(); return { right: c.right, window: document.documentElement.clientWidth }; });
    expect(Math.abs(r.window - r.right - INSET)).toBeLessThan(0.5);
  });
}
