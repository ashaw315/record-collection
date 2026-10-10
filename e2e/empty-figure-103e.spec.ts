import { expect, test, type Page } from '@playwright/test';
import { clearing } from '../src/app/figure-source';
import { login } from './sign-in';

/**
 * Step 103e, §T.6: the empty state's figure on the table and the grid.
 *
 * "The empty state's figure is drawn at the clearing height and no larger,
 * and stands where a screen's whole list or view is empty, never inside a
 * table's rows or a chart. At the clearing height... it fits a phone's 350,
 * so a phone keeps the ornament it was promised." "Where the empty state
 * shows, the heading's figure is not drawn, so the construction stands
 * once on a screen." "The sentence reads 'Nothing in the collection
 * matches.' under a filter or a search", "above one sentence saying what is
 * empty and a §9.3 control that changes it, such as CLEAR FILTERS."
 *
 * An empty COLLECTION cannot be staged here, since the database is shared
 * with the other worker; `CollectionList.test.tsx` holds that it has the
 * sentence alone. Playwright's WebKit on the mobile project; Mobile Safari
 * is in no test.
 */
const NOTHING = '&q=zzzzqqqq-nothing-matches-this';
const INKS = ['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)', 'lab(71.4 0.5 1.1)', 'oklch(0.74 0.004 80)'];

async function open(page: Page, view: 'table' | 'grid', width: number, query: string) {
  await page.setViewportSize({ width, height: width < 768 ? 664 : 900 });
  await page.goto(`/?view=${view}${query}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

const reading = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => { if (el === null) return null; const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const empty = document.querySelector('[data-collection-empty]');
    const figure = empty?.querySelector('[data-collection-empty-figure]') ?? null;
    const svg = figure?.querySelector('svg') ?? null;
    const sentence = empty?.querySelector('p') ?? null;
    const clear = empty?.querySelector<HTMLElement>('[data-collection-empty-clear]') ?? null;
    const cs = clear === null ? null : getComputedStyle(clear);
    return {
      stills: document.querySelectorAll('[data-testid="construction-still"]').length,
      heading: document.querySelector('[data-heading-figure]') !== null,
      figure: box(figure), svg: box(svg), record: svg?.getAttribute('data-record') ?? null,
      fills: svg === null ? [] : Array.from(new Set(Array.from(svg.querySelectorAll('polygon[data-face], circle')).map((el) => getComputedStyle(el).fill))),
      inRow: figure?.closest('table, tr, td, li, ul') !== null && figure !== null,
      sentence: box(sentence), text: (sentence?.textContent ?? '').trim(),
      clear: box(clear), clearText: (clear?.textContent ?? '').trim(), clearBorder: cs === null ? null : [cs.borderTopWidth, cs.borderTopStyle, cs.borderTopLeftRadius, cs.backgroundColor],
      paper: getComputedStyle(document.body).backgroundColor,
      window: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
    };
  });

test.beforeEach(async ({ page }) => login(page));

for (const view of ['table', 'grid'] as const) {
  for (const width of [1440, 768, 390, 320]) {
    /* Fails against the empty state as built: a sentence alone, and at 768 and up the heading's figure still drawn beside it. */
    test(`${view} at ${width}, nothing matching: one construction on the screen, the empty state’s, at its clearing height, above the sentence and CLEAR FILTERS`, async ({ page }) => {
      await open(page, view, width, NOTHING);
      await expect(page.locator('[data-collection-empty] [data-testid="construction-still"]')).toHaveCount(1);
      const r = await reading(page);
      expect(r.stills, 'the construction stands once on the screen').toBe(1);
      expect(r.heading, 'the heading’s figure is not drawn while the empty state shows').toBe(false);

      const height = clearing(r.record as string).height;
      expect(r.svg?.height, 'at the clearing height and no larger').toBeCloseTo(height, 0);
      expect(r.svg?.width, 'in its own proportion').toBeCloseTo(height * clearing(r.record as string).aspect, 0);
      expect(r.svg?.left, 'inside the window').toBeGreaterThanOrEqual(0);
      expect(r.svg?.right, 'inside the window').toBeLessThanOrEqual(r.window);
      expect(r.scrollWidth, 'and the page is no wider for it').toBe(r.window);
      expect(r.inRow, 'never inside a table’s rows or a list’s cells').toBe(false);
      for (const fill of r.fills) expect(INKS, `in ink alone: ${fill}`).toContain(fill);

      expect(r.text).toBe('Nothing in the collection matches.');
      expect(r.clearText).toMatch(/^clear filters$/i);
      expect(r.sentence?.top, 'the sentence is beneath the figure').toBeGreaterThanOrEqual((r.svg?.bottom ?? Infinity) - 0.5);
      expect(r.clear?.top, 'and the control beneath the sentence').toBeGreaterThanOrEqual((r.sentence?.bottom ?? Infinity) - 0.5);
      expect(r.clear?.height, '§9.3: 44 tall').toBeCloseTo(44, 0);
      expect(r.clearBorder?.slice(0, 3), '§9.3: an unfilled 1px box, square').toEqual(['1px', 'solid', '0px']);
      expect([r.paper, 'rgba(0, 0, 0, 0)'], 'unfilled').toContain(r.clearBorder?.[3]);
    });
  }

  /* Fails against a control that does nothing, or one that drops the view. */
  test(`${view}: CLEAR FILTERS brings the records back in the same view, and at 1440 the heading’s figure with them, still one construction`, async ({ page }) => {
    await open(page, view, 1440, NOTHING);
    await page.locator('[data-collection-empty-clear]').click();
    await expect(page).toHaveURL((url) => !url.searchParams.has('q') && url.searchParams.get('view') === view, { timeout: 15_000 });
    await expect(page.locator('[data-collection-empty]')).toHaveCount(0);
    await expect(page.locator('[data-heading-figure][data-drawn="true"]')).toHaveCount(1, { timeout: 15_000 });
    expect((await reading(page)).stills, 'once').toBe(1);
  });
}

/* "Test that a screen never draws the construction twice", across the states a reader can reach by the address. */
test('no state of the table or the grid draws the construction twice', async ({ page }) => {
  /* Twenty-four pages opened in one test: the default 30 seconds was this loop's own length on WebKit, and it ran out mid-load (step 110's run). */
  test.setTimeout(180_000);
  for (const view of ['table', 'grid'] as const) {
    for (const width of [1440, 768, 390]) {
      for (const query of ['', NOTHING, '&page=99', '&sort=title:asc']) {
        await open(page, view, width, query);
        await page.waitForTimeout(500);
        expect((await reading(page)).stills, `${view} at ${width} with "${query}"`).toBeLessThanOrEqual(1);
      }
    }
  }
});
