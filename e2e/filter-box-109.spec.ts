import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 109, §T.3: the box's inset and the page's return.
 *
 * "An option's name is set 18 inside the box's ink edge, and the row's hit
 * area runs to the edge. That is §G.3's inset, so a name never touches the
 * 1px edge." "When the panel closes, a page the floor moved returns by the
 * same distance in one instant move, unless the close came from the page
 * moving... A close caused by the line leaving the window leaves the page
 * where the reader's own move put it."
 *
 * Step 106 built the rows edge to edge and left the page where the floor's
 * move put it, each flagged as an interim; §T.3 had ruled neither way.
 */
const trigger = (page: Page, key = 'genreId') => page.locator(`[data-filter="${key}"] [data-filter-trigger]`);
const panel = (page: Page) => page.locator('[data-filter-panel]');
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));

async function open(page: Page, width: number, height: number) {
  await page.setViewportSize({ width, height });
  await page.goto('/?view=table');
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

/**
 * Opens Genre in a window short enough for the floor to move the page, and
 * says how far it went. The window is made from the last line's own place,
 * leaving 100 beneath it less the 24: at a fixed 600 high the floor moved
 * the page only while the block ended at 518, which step 111 changed and
 * which the shared database's filter lines change too.
 */
async function openMoved(page: Page): Promise<{ before: number; moved: number }> {
  const foot = await page.evaluate(() => { const l = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')); return l[l.length - 1].getBoundingClientRect().bottom; });
  await page.setViewportSize({ width: 1024, height: Math.round(foot) + 24 + 100 });
  await page.waitForTimeout(200);
  const before = await scrollY(page);
  await trigger(page).click();
  await expect(panel(page)).toHaveCount(1);
  await page.waitForTimeout(300);
  const moved = (await scrollY(page)) - before;
  expect(moved, 'the precondition: the floor moved the page').toBeGreaterThan(20);
  return { before, moved };
}

test.beforeEach(async ({ page }) => login(page));

test.describe('§T.3: an option’s name is 18 inside the box’s edge', () => {
  /* Fails against step 106's rows: the name begins at the ink edge. */
  test('at 1024, each name starts 18 inside the 1px edge and each count ends 18 inside it; the row itself runs to the edge and a press 6 inside it chooses', async ({ page }) => {
    await open(page, 1024, 800);
    await trigger(page).click();
    await expect(panel(page)).toHaveCount(1);
    const m = await page.evaluate(() => {
      const p = (document.querySelector('[data-filter-panel]') as HTMLElement).getBoundingClientRect();
      const text = (el: Element) => { const r = document.createRange(); r.selectNodeContents(el); return r.getBoundingClientRect(); };
      return { left: p.left, right: p.right, rows: Array.from(document.querySelectorAll<HTMLElement>('[data-filter-panel] [data-filter-option]')).slice(0, 4).map((o) => { const r = o.getBoundingClientRect(); return { left: r.left, right: r.right, top: r.top, name: text(o.querySelector('[data-filter-name]') as HTMLElement).left, count: text(o.querySelector('[data-filter-count]') as HTMLElement).right }; }) };
    });
    expect(m.rows.length).toBeGreaterThan(1);
    for (const row of m.rows) {
      expect(row.name - (m.left + 1), 'the name, from the ink edge').toBeCloseTo(18, 0);
      expect(m.right - 1 - row.count, 'the count, from the ink edge').toBeCloseTo(18, 0);
      expect(row.left, 'the row runs to the edge on the left').toBeCloseTo(m.left + 1, 0);
      expect(row.right, 'and on the right').toBeCloseTo(m.right - 1, 0);
    }
    await page.mouse.click(m.left + 6, m.rows[1].top + 22);
    await expect(page, 'a press between the edge and the name chooses the row').toHaveURL(/genreId=/, { timeout: 15_000 });
  });

  /* The sheet is not the box: its rows keep the 20 inset from the window that step 101 gave them. Passes before; here so the inset is not spread to it. */
  test('at 390 the sheet’s names are where they were, at the list’s own left', async ({ page }) => {
    await open(page, 390, 664);
    await trigger(page).click();
    const m = await page.evaluate(() => { const o = document.querySelector('[data-filter-panel] [data-filter-option]') as HTMLElement; const r = document.createRange(); r.selectNodeContents(o.querySelector('[data-filter-name]') as HTMLElement); return { row: o.getBoundingClientRect().left, name: r.getBoundingClientRect().left, line: (document.querySelector('[data-filter-trigger]') as HTMLElement).getBoundingClientRect().left }; });
    expect(m.name).toBeCloseTo(m.row, 0);
    expect(m.row).toBeCloseTo(m.line, 0);
  });
});

test.describe('§T.3: a page the floor moved returns when the panel closes', () => {
  const closes: [string, (page: Page) => Promise<void>][] = [
    ['CLOSE', async (page) => { await page.locator('[data-filter-close]').click(); }],
    ['Escape', async (page) => { await page.keyboard.press('Escape'); }],
    ['a press on the page beside the box', async (page) => { const b = await panel(page).evaluate((p) => p.getBoundingClientRect().right); await page.mouse.click(b + 120, 300); }],
    ['a second press on its own line', async (page) => { await trigger(page).click(); }],
    ['Back', async (page) => { await page.goBack(); }],
  ];
  for (const [name, close] of closes) {
    /* Fails against step 106: the page stayed where the floor's move put it. */
    test(`at 1024 by 600, closed by ${name}, the page is back where it was before the floor moved it`, async ({ page }) => {
      await open(page, 1024, 600);
      const { before } = await openMoved(page);
      await close(page);
      await expect(panel(page)).toHaveCount(0);
      await expect.poll(() => scrollY(page), 'returned by the same distance').toBe(before);
      /* And it stays: nothing later (the step back over the filter's entry) puts it back down. */
      await page.waitForTimeout(600);
      expect(await scrollY(page), 'and it stays there').toBe(before);
    });
  }

  /* Fails against step 106, and against a return the option's navigation undoes. */
  test('at 1024 by 600, closed by choosing an option, the page is back where it was and the option is in force', async ({ page }) => {
    await open(page, 1024, 600);
    const { before } = await openMoved(page);
    await panel(page).locator('[data-filter-option]').first().click();
    await expect(page).toHaveURL(/genreId=/, { timeout: 15_000 });
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(() => scrollY(page)).toBe(before);
    await page.waitForTimeout(600);
    expect(await scrollY(page)).toBe(before);
  });

  /* Fails against a return made on every close: the page would jump back up by the floor's move after the reader's own. */
  test('where the close came from the line leaving the window, the page is left where that move put it', async ({ page }) => {
    await open(page, 1024, 600);
    await openMoved(page);
    const to = await page.evaluate(() => { const y = document.documentElement.scrollHeight - window.innerHeight; window.scrollTo(0, y); return Math.round(y); });
    await expect.poll(() => page.evaluate(() => { const l = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')); return l[l.length - 1].getBoundingClientRect().bottom <= 0; }), 'the precondition: the staged move took the last line out of the window').toBe(true);
    await expect(panel(page)).toHaveCount(0);
    await page.waitForTimeout(600);
    expect(await scrollY(page), 'not returned').toBe(to);
  });

  /* A second filter opened over the first moves nothing more, and one close returns the one move. */
  test('switched from Genre to Label and then closed, the page returns by the one move the floor made', async ({ page }) => {
    await open(page, 1024, 600);
    const { before } = await openMoved(page);
    await trigger(page, 'labelId').click();
    await expect(trigger(page, 'labelId')).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Escape');
    await expect(panel(page)).toHaveCount(0);
    await expect.poll(() => scrollY(page)).toBe(before);
  });
});
