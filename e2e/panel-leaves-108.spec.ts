import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 108, §T.3: "When the page moves far enough that the last filter
 * line leaves the window, the open panel closes. The panel belongs beneath
 * its line, and with the line gone it would be an open list with no
 * trigger, which nothing reads as a filter." It replaces step 107's interim
 * hold of the panel's top at the window's top, which no ruling gave. "The
 * close does nothing else, and returns focus to the line only if the line
 * is in view."
 *
 * A finger, the wheel and the keyboard are held (steps 101 and 107), so
 * what is left to move the page behind an open panel is a script, focus
 * moved onto the page, and a window that changes size. Each is staged
 * here, and each test reads that the staged move took the line out of the
 * window BEFORE it reads that the panel closed.
 *
 * **Not staged, with the reason.** Find-in-page: Playwright drives no
 * browser's find bar, in either engine. Scroll restoration: the browser
 * restores a scroll position on a history traversal or a reload, and
 * either one closes the panel by itself (Back is in the close set; a
 * reload starts the page closed), so there is no moment with a panel open
 * and a restoration under it to stage. Mobile Safari is in no test.
 */
const trigger = (page: Page) => page.locator('[data-filter="genreId"] [data-filter-trigger]');
const panel = (page: Page) => page.locator('[data-filter-panel]');

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/?view=table');
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

const reading = (page: Page) =>
  page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]'));
    const last = lines[lines.length - 1].getBoundingClientRect();
    const p = document.querySelector<HTMLElement>('[data-filter-panel]');
    const active = document.activeElement;
    return { scrollY: Math.round(window.scrollY), lastTop: Math.round(last.top), lastFoot: Math.round(last.bottom), height: window.innerHeight, panelTop: p === null ? null : Math.round(p.getBoundingClientRect().top), onLine: active !== null && active.matches('[data-filter-trigger]'), active: active === null ? null : `${active.tagName}${active.getAttribute('href') ?? ''}`, root: document.documentElement.style.overflow, entry: (window.history.state as { collectionFilter?: boolean } | null)?.collectionFilter === true };
  });

test.beforeEach(async ({ page }) => login(page));

for (const [width, height] of [[390, 664], [1024, 800]] as const) {
  test.describe(`§T.3 at ${width}: the panel closes when the last filter line leaves the window`, () => {
    /* Fails against step 107's interim: the panel stayed, its top held at the window's top. */
    test('a script takes the line above the window: the panel closes, the page stays where the script put it, focus is not sent to the line, and the page is released', async ({ page }) => {
      await open(page, width, height);
      const url = page.url();
      const entries = await page.evaluate(() => window.history.length);
      await trigger(page).click();
      await expect(panel(page)).toHaveCount(1);
      /* Focus off the line, so "not sent to the line" can fail. */
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

      const to = await page.evaluate(() => { const y = document.documentElement.scrollHeight - window.innerHeight; window.scrollTo(0, y); return Math.round(y); });
      await expect.poll(async () => (await reading(page)).lastFoot, 'the precondition: the staged move took the last line above the window').toBeLessThanOrEqual(0);
      await expect(panel(page), 'the panel closed').toHaveCount(0);
      await expect(page.locator('[data-filter-trigger][aria-expanded="true"]')).toHaveCount(0);
      /* Long enough for the close's step back over its history entry to have landed, and for anything it restored to show. */
      await page.waitForTimeout(600);
      const after = await reading(page);
      expect(after.scrollY, 'the close did nothing else: the page is where the script put it').toBe(to);
      expect(after.onLine, 'focus was not sent to a line that is out of view').toBe(false);
      expect(after.root, 'the page is released').toBe('');
      expect(after.entry, 'and the filter’s history entry is gone').toBe(false);
      expect(page.url()).toBe(url);
      expect(await page.evaluate(() => window.history.length), 'no entry left behind').toBeLessThanOrEqual(entries + 1);
    });

    /* The edge of the rule: a line partly out has not left. Fails against a close taken when the line first touches the window's top. */
    test('with the last line partly above the window, the panel stays, beneath what is left of the line', async ({ page }) => {
      await open(page, width, height);
      await trigger(page).click();
      await expect(panel(page)).toHaveCount(1);
      const at = await reading(page);
      await page.evaluate((y) => window.scrollBy(0, y), at.lastFoot - 10);
      await expect.poll(async () => (await reading(page)).lastFoot, 'the precondition: 10 of the last line is in the window').toBe(10);
      await page.waitForTimeout(300);
      await expect(panel(page)).toHaveCount(1);
      expect((await reading(page)).panelTop).toBe(10);
    });

    /* Fails against step 107's interim, by another mover: focus sent to a link far down the page scrolls it into view. */
    test('focus moved onto the page takes the line out of the window: the panel closes and focus stays where it was sent', async ({ page }) => {
      await open(page, width, height);
      await trigger(page).click();
      await expect(panel(page)).toHaveCount(1);
      const sent = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll<HTMLElement>('main a[href]'));
        const far = links[links.length - 1];
        far.focus();
        return `${far.tagName}${far.getAttribute('href') ?? ''}`;
      });
      await expect.poll(async () => (await reading(page)).lastFoot, 'the precondition: the focus took the last line above the window').toBeLessThanOrEqual(0);
      await expect(panel(page), 'the panel closed').toHaveCount(0);
      await page.waitForTimeout(600);
      const after = await reading(page);
      expect(after.active, 'focus is where it was sent, not on the line').toBe(sent);
      expect(after.lastFoot, 'and the page did not go back to the line').toBeLessThanOrEqual(0);
    });

    /* Fails against step 107's interim, by a third mover: the window made too short to hold the lines. */
    test('a window made so short that the last line is below it: the panel closes', async ({ page }) => {
      await open(page, width, height);
      await trigger(page).click();
      await expect(panel(page)).toHaveCount(1);
      const at = await reading(page);
      await page.setViewportSize({ width, height: Math.max(120, at.lastTop - 40) });
      await expect.poll(async () => { const r = await reading(page); return r.lastTop >= r.height; }, 'the precondition: the last line is below the window').toBe(true);
      await expect(panel(page), 'the panel closed').toHaveCount(0);
    });

    /* §T.3: "the page held in both directions". A confirmation: passes against the build before this step if the hold reaches the keyboard. */
    test('the keyboard does not move the page behind an open panel: End, Page Down, Space and the arrows', async ({ page }) => {
      await open(page, width, height);
      /* The apparatus, shown working: closed, End moves the page. */
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press('End');
      await expect.poll(async () => (await reading(page)).scrollY, 'the precondition: closed, End moves the page').toBeGreaterThan(0);
      /* Chromium animates End's scroll: let it finish, or it carries on under the panel and reads as the keyboard moving a held page. */
      await page.waitForTimeout(1_200);
      await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
      await page.waitForTimeout(400);
      expect((await reading(page)).scrollY, 'the precondition: back at the top, and settled').toBe(0);

      await trigger(page).click();
      await expect(panel(page)).toHaveCount(1);
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      for (const key of ['End', 'PageDown', 'Space', 'ArrowDown', 'ArrowDown', 'ArrowDown']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(250);
        expect((await reading(page)).scrollY, `${key}: the page did not move`).toBe(0);
        await expect(panel(page), `${key}: the panel is open`).toHaveCount(1);
      }
    });
  });
}
