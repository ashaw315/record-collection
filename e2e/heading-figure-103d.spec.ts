import { expect, test, type Page } from '@playwright/test';
import { clearing } from '../src/app/figure-source';
import { login } from './sign-in';

/**
 * Step 103d, §T.6: the heading's figure on the table and the grid.
 *
 * "The heading's figure takes the air right of the band at the largest
 * height that air holds, and is drawn only where that height is at least
 * the height at which its construction's narrowest face clears §29's 6px."
 * "The air is measured after a 24 margin on every side where it meets
 * anything drawn: a control, type, an image, a rule or the header." "Every
 * figure in the app is drawn from one record, the one in the collection
 * whose construction clears §29's 6px at the smallest height." "On a phone
 * the only ornament is the empty state's."
 *
 * **What this reads, and what it leaves to the unit tests.** The other
 * worker adds and deletes records while this runs, so "the one source
 * record" cannot be named from outside the page. What can be read is that
 * the figure's record clears no higher than any record the same render
 * shows, since every record shown is in the collection. That the source
 * does not follow sort, filter or page is `figure-source.test.ts`'s (the
 * choice ignores order) and `list-record-ages.test.ts`'s (it is asked of
 * the whole collection).
 *
 * **Not built here: §26's solids.** The figure is the construction in ink
 * alone. How three solids stand with a construction is not ruled, and
 * nothing in the app draws three; it is with Design.
 */
const MARGIN = 24;
const INKS = ['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)', 'lab(71.4 0.5 1.1)', 'oklch(0.74 0.004 80)'];

async function open(page: Page, view: 'table' | 'grid', width: number, query = '') {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?view=${view}${query}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-heading-figure][data-measured="true"]').waitFor({ state: 'attached', timeout: 15_000 });
  if (view === 'grid') await page.locator('[data-collection-grid] li').first().waitFor();
}

const reading = (page: Page) =>
  page.evaluate((margin) => {
    const host = document.querySelector<HTMLElement>('[data-heading-figure]');
    if (host === null) return null;
    const drawn = host.getAttribute('data-drawn') === 'true';
    /* Step 110: the figure is one drawing holding the construction's still and a row of solids; the construction is the still. */
    const svg = host.querySelector<SVGSVGElement>('[data-testid="construction-still"]');
    const r = host.getBoundingClientRect();
    const air = { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    /* Everything drawn on the page that is not the figure: type by its own box, the rest by the element's. */
    const meets: string[] = [];
    if (drawn) {
      const rectOf = (el: Element) => {
        if (el.matches('h1, p, span, label, th, td, li > div, a') && el.childElementCount === 0 && (el.textContent ?? '').trim() !== '') {
          const range = document.createRange();
          range.selectNodeContents(el);
          return range.getBoundingClientRect();
        }
        return el.getBoundingClientRect();
      };
      for (const el of Array.from(document.querySelectorAll('header[data-app-nav], main input, main select, main button, main a, main img, main h1, main p, main span, main label, main th'))) {
        if (host.contains(el) || el.closest('.sr-only') !== null) continue;
        if (!el.matches('header, input, select, button, img') && (el.childElementCount > 0 || (el.textContent ?? '').trim() === '')) continue;
        const b = rectOf(el);
        if (b.width === 0 || b.height === 0) continue;
        const cs = getComputedStyle(el);
        if (cs.visibility === 'hidden' || cs.display === 'none') continue;
        /* Grown by the margin, less half a pixel for rounding: it must not reach the air. */
        const g = margin - 0.5;
        if (b.left - g < air.right && b.right + g > air.left && b.top - g < air.bottom && b.bottom + g > air.top) meets.push(`${el.tagName} "${(el.textContent ?? '').trim().slice(0, 24)}" at ${Math.round(b.left)},${Math.round(b.top)} to ${Math.round(b.right)},${Math.round(b.bottom)}`);
      }
    }
    const fills = svg === null ? [] : Array.from(new Set(Array.from(svg.querySelectorAll('polygon[data-face], circle')).map((el) => getComputedStyle(el).fill)));
    const viewBox = svg?.getAttribute('viewBox')?.split(' ').map(Number) ?? null;
    const cs = getComputedStyle(host);
    const shown = Array.from(document.querySelectorAll<HTMLAnchorElement>('main [data-collection-table] tbody a[href^="/records/"], main [data-collection-grid] a[href^="/records/"]')).map((a) => (a.getAttribute('href') ?? '').replace('/records/', ''));
    return {
      drawn, air, meets, fills, viewBox, shown,
      record: host.getAttribute('data-record'), clearing: Number(host.getAttribute('data-clearing')), airFigure: Number(host.getAttribute('data-air-figure')),
      position: cs.position, pointer: cs.pointerEvents, hidden: host.getAttribute('aria-hidden'),
      stillRecord: svg?.getAttribute('data-record') ?? null,
      windowWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      listRight: (document.querySelector('main [data-collection-table] table, main [data-collection-grid]') as HTMLElement).getBoundingClientRect().right,
    };
  }, MARGIN);

/** The figure's height as drawn: what the air says the whole figure, construction and row, has in it. */
const drawnHeight = (r: { airFigure: number }) => r.airFigure;

test.beforeEach(async ({ page }) => login(page));

for (const view of ['table', 'grid'] as const) {
  /*
    Step 110 put the row of solids in the figure's box, so the figure is
    about three times as wide as tall and the air at 1024 and 768 no longer
    holds it on every collection. 1920 and 1440 hold it; at the two
    narrower widths the test reads whichever is true and holds the rule:
    drawn exactly where the whole figure reaches the clearing height.
  */
  for (const width of [1920, 1440, 1024, 768]) {
    /* Fails against the page as built: there is no figure. */
    test(`${view} at ${width}: the source record’s construction stands in the air in ink, 24 clear of everything drawn, at a height that clears §29, or the air is too small and nothing is drawn`, async ({ page }) => {
      await open(page, view, width);
      const r = await reading(page);
      expect(r, 'the figure’s place is on the page').not.toBeNull();
      const f = r as NonNullable<typeof r>;
      expect(f.drawn, `drawn exactly where the figure clears: ${f.airFigure} against ${f.clearing}`).toBe(f.airFigure >= f.clearing);
      if (width >= 1440) expect(f.drawn, 'the figure is drawn').toBe(true);
      if (!f.drawn) {
        expect(await page.locator('[data-heading-figure] svg').count(), 'not drawn: no construction and no solids').toBe(0);
        return;
      }
      expect(f.meets, 'nothing drawn is within 24 of the air').toEqual([]);
      expect(f.air.left, 'right of the band').toBeGreaterThan(443);
      /* Step 110: the air ran to the window's edge, past the page's own inset, and the last solid stood against the glass. */
      expect(f.air.right, 'no further right than the list, which is the page’s own edge').toBeLessThanOrEqual(f.listRight + 0.5);
      expect(f.scrollWidth, 'and the page is no wider for it').toBe(f.windowWidth);

      expect(f.stillRecord, 'the construction drawn is the named record’s').toBe(f.record);
      expect(f.clearing, 'its clearing height is its construction’s').toBeCloseTo(clearing(f.record as string).height, 3);
      expect(drawnHeight(f), 'drawn no smaller than the height at which its narrowest face is 6').toBeGreaterThanOrEqual(f.clearing);
      expect(f.shown.length, 'the precondition: the page shows records').toBeGreaterThan(3);
      for (const id of f.shown) expect(f.clearing, `no record shown clears lower: ${id}`).toBeLessThanOrEqual(clearing(id).height + 1e-6);

      for (const fill of f.fills) expect(INKS, `in ink alone: ${fill}`).toContain(fill);
      expect({ position: f.position, pointer: f.pointer, hidden: f.hidden }, 'out of the flow, taking no press, and not read out').toEqual({ position: 'absolute', pointer: 'none', hidden: 'true' });
    });
  }

  for (const width of [390, 320]) {
    /* "On a phone the only ornament is the empty state's." Fails against a figure placed below the heading or scaled down to fit. */
    test(`${view} at ${width}: there is no heading figure`, async ({ page }) => {
      await open(page, view, width);
      const r = await reading(page);
      expect(r?.drawn, 'measured, and not drawn').toBe(false);
      expect(await page.locator('[data-heading-figure] svg').count()).toBe(0);
    });
  }
}

test.describe('§T.6: the figure does not follow the page', () => {
  /* Fails against a source taken from the page's first record, which a re-sort changes. */
  test('re-sorted, in the other view and under a filter, the figure is drawn and still clears no higher than anything shown', async ({ page }) => {
    for (const query of ['&sort=title:asc', '&sort=title:desc', '&sort=releaseYear:desc']) {
      await open(page, 'table', 1440, query);
      const f = (await reading(page)) as NonNullable<Awaited<ReturnType<typeof reading>>>;
      expect(f.drawn, query).toBe(true);
      for (const id of f.shown) expect(f.clearing, `${query}: ${id}`).toBeLessThanOrEqual(clearing(id).height + 1e-6);
    }
    /* A filter: the first genre's option, pressed. The records shown are then a few, and the figure is not one of theirs unless it happens to be. */
    await open(page, 'table', 1440);
    await page.locator('[data-filter="genreId"] [data-filter-trigger]').click();
    await page.locator('[data-filter="genreId"] [data-filter-option]').first().click();
    await expect(page).toHaveURL(/genreId=/, { timeout: 15_000 });
    await expect.poll(async () => (await reading(page))?.drawn, 'under a filter the figure is drawn').toBe(true);
    const f = (await reading(page)) as NonNullable<Awaited<ReturnType<typeof reading>>>;
    expect(f.meets, 'and still 24 clear, with CLEAR FILTER now in the column').toEqual([]);
    expect(f.clearing).toBeCloseTo(clearing(f.record as string).height, 3);
  });

  /*
    Step 110, seen on the real collection's capture at 1440: the air under
    Add record ran to the window's edge, past the page's 20 inset, and the
    last solid stood against the glass. Staged, since which of the two
    rectangles is the air depends on the collection: with Add record taken
    out of the page there is one rectangle, and it runs to the edge.
    Fails against an edge taken as the window's.
  */
  test('the air ends at the page’s own right edge, where the list ends, and not at the window’s', async ({ page }) => {
    await open(page, 'table', 1440);
    await page.addStyleTag({ content: '[data-collection-band] a[href="/records/new"]{display:none!important}' });
    /* A change of the window's size is what makes the figure measure again. */
    await page.setViewportSize({ width: 1441, height: 900 });
    await page.waitForTimeout(500);
    const f = (await reading(page)) as NonNullable<Awaited<ReturnType<typeof reading>>>;
    expect(f.drawn, 'the precondition: the figure is drawn').toBe(true);
    expect(f.listRight, 'the precondition: the list ends inside the window').toBeLessThan(f.windowWidth - 10);
    expect(f.air.right, 'the air ends where the list ends').toBeCloseTo(f.listRight, 0);
  });

  /* The figure is placed against the page, so it goes with it: fails against a figure fixed to the window. */
  test('scrolled, the figure goes with the page and the table’s sticking header does not move it', async ({ page }) => {
    await open(page, 'table', 1440);
    const at = (await reading(page)) as NonNullable<Awaited<ReturnType<typeof reading>>>;
    await page.evaluate(() => window.scrollTo(0, 300));
    await page.waitForTimeout(400);
    const after = (await reading(page)) as NonNullable<Awaited<ReturnType<typeof reading>>>;
    expect(after.air.top, 'up with the page by 300').toBeCloseTo(at.air.top - 300, 0);
    expect(after.air.height, 'and no taller or shorter').toBeCloseTo(at.air.height, 0);
  });
});
