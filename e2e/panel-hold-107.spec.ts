import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 107, §T.3: the page behind an open filter is held against a finger,
 * and the panel stays beneath its lines whatever moves the page.
 *
 * Adam, on his phone, 9 Oct: "the background scrolled when i moved on it".
 * §T.3 rules "the page beneath does not move", held in both directions. The
 * hold was `overflow: hidden` on the root, which Mobile Safari does not
 * keep against a finger. And the panel was placed when it opened and again
 * only on a resize, so once the page moved the lines went and the panel
 * stayed.
 *
 * **What this can and cannot show.** The engine that showed the defect is
 * the one no test here runs: Playwright's WebKit has no touch drag, and it
 * is not Mobile Safari. So:
 *   - the panel following its lines is tested for real, by a scripted
 *     scroll, on both projects;
 *   - open and close moving nothing is tested for real, on both projects;
 *   - the finger is tested as a STAGED PROXY, on Chromium's touch stream
 *     with the root's `overflow` taken off, which is what a root that does
 *     not hold amounts to. It proves the hold does not rest on the root. It
 *     does not prove the phone; that check is Adam's.
 */
const WIDTH = 390;
const HEIGHT = 664;
const SHORT = 560;
const trigger = (page: Page) => page.locator('[data-filter="genreId"] [data-filter-trigger]');
const panel = (page: Page) => page.locator('[data-filter-panel]');

async function open(page: Page, from = 0, height = HEIGHT) {
  await page.setViewportSize({ width: WIDTH, height });
  await page.goto('/?view=table');
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  if (from > 0) await page.evaluate((y) => window.scrollTo(0, y), from);
}

const reading = (page: Page) =>
  page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')).map((b) => Math.round(b.getBoundingClientRect().top));
    const last = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')).pop() as HTMLElement;
    const p = document.querySelector<HTMLElement>('[data-filter-panel]');
    const row = document.querySelector<HTMLElement>('main table tbody tr');
    return { scrollY: window.scrollY, scrollX: window.scrollX, length: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, lines, lastFoot: Math.round(last.getBoundingClientRect().bottom), row: row === null ? null : Math.round(row.getBoundingClientRect().top), panelTop: p === null ? null : Math.round(p.getBoundingClientRect().top), listAt: p === null ? null : Math.round(p.scrollTop) };
  });

test.beforeEach(async ({ page }) => login(page));

test.describe('§T.3: the panel stays beneath the last filter line when the page moves', () => {
  /* Fails against a panel placed on open and on resize only: the page goes 120, the lines go up 120, and the panel's top stays where it was. */
  test('a scripted scroll moves the page, and the panel’s top follows the last line’s foot', async ({ page }) => {
    await open(page);
    await trigger(page).click();
    await expect(panel(page)).toHaveCount(1);
    const at = await reading(page);
    expect(at.panelTop, 'placed beneath the last line').toBe(at.lastFoot);

    await page.evaluate(() => window.scrollBy(0, 120));
    await expect.poll(async () => (await reading(page)).scrollY, 'the precondition: a script does move the page').toBe(120);
    await expect.poll(async () => { const r = await reading(page); return (r.panelTop ?? NaN) - r.lastFoot; }, 'the panel is still beneath the last line').toBe(0);
    expect((await reading(page)).lastFoot, 'and the line did move').toBe(at.lastFoot - 120);

    await page.evaluate(() => window.scrollBy(0, -120));
    await expect.poll(async () => (await reading(page)).panelTop, 'and back').toBe(at.lastFoot);
  });

  /*
    A second test stood here: "with the lines gone above the window, the
    panel starts at the window's top". That was step 107's interim, which
    no ruling gave. Step 108 rules that the panel closes there, and its
    spec (`panel-leaves-108.spec.ts`) holds the case.
  */
});

test.describe('§T.3: nothing moves on open or on close', () => {
  for (const from of [0, 150]) {
    /* The ruling the fix must not break: a lock that repositions the page fails this, by dropping the page to its top. Passes against the build before step 107. */
    test(`from ${from} down: the page’s scroll, length and width, every line and the first row are where they were, open and closed again`, async ({ page }) => {
      await open(page, from);
      const strip = (r: Awaited<ReturnType<typeof reading>>) => ({ scrollY: r.scrollY, scrollX: r.scrollX, length: r.length, width: r.width, lines: r.lines, row: r.row });
      const closed = strip(await reading(page));
      expect(closed.scrollY, 'the precondition: the page is where it was put').toBe(from);
      await trigger(page).click();
      await expect(panel(page)).toHaveCount(1);
      expect(strip(await reading(page)), 'open').toEqual(closed);
      await trigger(page).click();
      await expect(panel(page)).toHaveCount(0);
      expect(strip(await reading(page)), 'closed again').toEqual(closed);
    });
  }
});

/** A finger's drag by CDP: `dy` is how far the finger goes UP the screen, so a positive one asks the page to go down. */
async function drag(context: BrowserContext, page: Page, x: number, y: number, dy: number) {
  const cdp = await context.newCDPSession(page);
  const point = (py: number) => [{ x, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(y) });
  for (let i = 1; i <= 12; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(y - (dy * i) / 12) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  await cdp.detach();
}

test.describe('§T.3, staged: with a root that does not hold, a finger still does not move the page', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'a touch drag needs CDP: Chromium only. The phone’s engine is not tested for this.');

  /* Fails against the hold as built, which is the root's overflow and nothing else: staged off, every drag moves the page. */
  test('a drag on the inset, above the lines and past the list’s top leaves the page still; a drag on the list moves the list', async ({ browser, baseURL }) => {
    /* A shorter window, so the seeded genres are a list longer than the panel. */
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: WIDTH, height: SHORT }, baseURL });
    const page = await context.newPage();
    try {
      await login(page);
      await open(page, 0, SHORT);

      /* The apparatus, shown working: closed, the same drag moves the page. */
      await drag(context, page, WIDTH - 30, 300, 100);
      const moved = (await reading(page)).scrollY;
      expect(moved, 'the precondition: closed, a finger’s drag moves the page').toBeGreaterThan(0);
      await page.evaluate(() => window.scrollTo(0, 0));

      await page.locator('[data-filter="genreId"] [data-filter-trigger]').tap();
      await expect(panel(page)).toHaveCount(1);
      /* The staging: an engine whose root does not hold against a finger. */
      await page.evaluate(() => { document.documentElement.style.overflow = ''; });
      const at = await reading(page);
      const box = await panel(page).evaluate((p) => { const r = p.getBoundingClientRect(); return { top: r.top, height: r.height, range: p.scrollHeight - p.clientHeight }; });
      expect(box.range, 'the precondition: the list is longer than the panel').toBeGreaterThan(40);
      const mid = box.top + box.height / 2;

      await drag(context, page, WIDTH / 2, mid, -120);
      expect(await reading(page), 'finger down on the list at its top').toMatchObject({ scrollY: at.scrollY, listAt: 0 });
      await drag(context, page, 8, mid, -120);
      expect((await reading(page)).scrollY, 'finger down on the inset').toBe(at.scrollY);
      for (const dy of [120, -120]) {
        await drag(context, page, WIDTH - 30, Math.max(70, at.lines[0] - 40), dy);
        expect((await reading(page)).scrollY, `finger ${dy > 0 ? 'up' : 'down'} above the filter lines`).toBe(at.scrollY);
      }
      await drag(context, page, WIDTH / 2, mid, 40);
      const after = await reading(page);
      expect(after.listAt, 'finger up on the list: the list goes down').toBeGreaterThan(0);
      expect(after.scrollY, 'and the page does not').toBe(at.scrollY);
      expect(after.panelTop, 'the panel has not left its lines').toBe(after.lastFoot);
      await expect(panel(page), 'no drag closed the panel').toHaveCount(1);
    } finally {
      await context.close();
    }
  });
});
