import { expect, test, type Page } from '@playwright/test';
import { CAP, FIGURE_FRACTION, FORK, RECORD_MINIMUM, SIDEBAR, contentColumn, gridColumns } from '../src/app/sidebar-layout';
import { login } from './sign-in';

/**
 * Step 113, §T.1 and §T.6: Adam's wireframe. Above the fork the table and
 * the grid have a sidebar at the window's left edge, 336 wide and closed by
 * a full-height rule, with a content column beside it; the head figure is
 * the source record's construction in its tint at 0.328 of that column,
 * a fragment of it bleeds off the sidebar's foot, and each carries two
 * diagonals. Below the fork nothing here applies.
 *
 * Every figure is read from `sidebar-layout.ts`, which the stylesheet is
 * built from, so this checks the rendering against the declaration.
 */
const VIEWS = ['table', 'grid'] as const;
const ABOVE = [FORK, 1440, 1920];

async function open(page: Page, width: number, view: string, query = '', height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?view=${view}${query}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

const reading = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => { if (el === null || (el as HTMLElement).getClientRects().length === 0) return null; const b = el.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height }; };
    const ink = (el: Element | null) => { if (el === null) return null; const r = document.createRange(); r.selectNodeContents(el); const b = r.getBoundingClientRect(); return { left: b.left, right: b.right, top: b.top, bottom: b.bottom }; };
    const q = (s: string) => document.querySelector(s);
    const main = q('main') as HTMLElement;
    const side = q('[data-collection-sidebar]') as HTMLElement | null;
    const head = q('[data-head-figure]') as HTMLElement | null;
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]'));
    return {
      window: document.documentElement.clientWidth,
      viewport: window.innerHeight,
      wordmark: ink(q('[data-wordmark]')),
      header: box(q('[data-app-nav]')),
      main: box(main),
      side: box(side),
      sideRule: side === null ? null : { width: getComputedStyle(side).borderRightWidth, style: getComputedStyle(side).borderRightStyle },
      search: box(q('#rail-search')),
      searchLabel: ink(q('label[for="rail-search"]')),
      glyph: box(q('[data-search-glyph]')),
      views: Array.from(document.querySelectorAll('[data-collection-band] ul a')).map((a) => ink(a)),
      bandAdd: box(q('[data-collection-band] nav > a')),
      count: ink(q('[data-collection-count]')),
      heading: ink(q('[data-collection-heading] h1')),
      sortRow: box(q('[data-sort-row]')),
      sort: box(q('[data-sort-control]')),
      sortText: ink(q('[data-sort-current]')),
      chevron: box(q('[data-sort-chevron]')),
      lines: lines.map((l) => box(l)),
      marks: lines.map((l) => box(l.querySelector('[data-filter-mark]'))),
      after: box(q('[data-filter-after]')),
      clear: box(q('[data-filter-clear]')),
      panel: box(q('[data-filter-panel]')),
      list: box(q('main [data-collection-table] table, main [data-collection-grid], main [data-collection-empty]')),
      gridColumns: (() => { const g = q('main [data-collection-grid]'); return g === null ? null : getComputedStyle(g).gridTemplateColumns.split(' ').length; })(),
      headBox: box(q('[data-collection-head]')),
      head: box(head),
      headRecord: head?.querySelector('svg')?.getAttribute('data-record') ?? null,
      figure: head === null ? null : { record: head.dataset.record, clearing: Number(head.dataset.clearing), aspect: Number(head.dataset.aspect), tint: head.dataset.tint ?? '' },
      add: box(q('[data-add-record]')),
      addMark: box(q('[data-add-record] svg')),
      fragment: box(q('[data-sidebar-fragment]')),
      fragmentFigure: box(q('[data-fragment-figure]')),
      fragmentRecord: q('[data-fragment-figure] svg')?.getAttribute('data-record') ?? null,
      pager: box(q('main nav[aria-label="Pagination"], main [data-collection-pagination]')),
    };
  });

test.beforeEach(async ({ page }) => login(page));

for (const view of VIEWS) {
  test.describe(`§T.1, the ${view}: the sidebar and the content column above the fork`, () => {
    for (const width of ABOVE) {
      /* Fails against the two-row band and the list at the 20 inset at every one of these widths. */
      test(`at ${width}: the sidebar is 336 from the window’s left edge, its content 18 to 318 on the wordmark’s left, its rule at 336 to the window’s foot; the content runs from 377 to 40 short of the window, and no further than 1,400`, async ({ page }) => {
        await open(page, width, view);
        const r = await reading(page);
        if (r.side === null || r.wordmark === null || r.search === null || r.list === null || r.main === null || r.header === null) throw new Error('the sidebar, the wordmark, search or the list is not drawn');
        expect(r.side.left, 'the sidebar starts at the window’s left edge').toBe(0);
        expect(r.side.right, 'its rule’s far side').toBe(SIDEBAR.width + SIDEBAR.rule);
        expect(r.sideRule, 'a 1px rule').toEqual({ width: '1px', style: 'solid' });
        expect(r.side.top, 'the rule starts under the header').toBeCloseTo(r.header.bottom, 0);
        expect(r.side.bottom, 'and runs to the window’s foot, or the page’s where that is lower').toBeGreaterThanOrEqual(r.viewport - 0.5);
        expect(Math.abs(r.wordmark.left - SIDEBAR.inset), 'the precondition: the wordmark is at 18').toBeLessThan(0.5);
        const lefts: [string, number | undefined][] = [['SEARCH', r.searchLabel?.left], ['the search field', r.search.left], ['the first view name', r.views[0]?.left], ['the count', r.count?.left], ['the heading', r.heading?.left], ['Sort', r.sortText?.left], ['the first filter line', r.lines[0]?.left]];
        for (const [name, left] of lefts) {
          if (left === undefined) throw new Error(`${name} is not drawn`);
          /* The heading's glyphs carry their own side bearing; its box is read with the others below. */
          if (name !== 'the heading') expect(Math.abs(left - r.wordmark.left), `${name} starts on the wordmark’s left`).toBeLessThan(0.5);
        }
        const far = SIDEBAR.width - SIDEBAR.inset;
        expect(r.search.right, 'the search field ends at 318').toBeCloseTo(far, 0);
        expect(r.sortRow?.right ?? 0, 'the Sort row ends at 318').toBeCloseTo(far, 0);
        for (const line of r.lines) expect(line?.right ?? 0, 'each filter line ends at 318').toBeCloseTo(far, 0);
        expect(r.search.width, 'so the measure is 300').toBeCloseTo(SIDEBAR.width - 2 * SIDEBAR.inset, 0);
        const first = SIDEBAR.width + SIDEBAR.rule + SIDEBAR.gap;
        expect(r.list.left, 'the content starts at 377').toBeCloseTo(first, 0);
        expect(r.list.right, 'and ends 40 short of the window, or at 1,400').toBeCloseTo(Math.min(r.window, CAP) - SIDEBAR.gap, 0);
        expect(r.list.width).toBeCloseTo(contentColumn(r.window), 0);
        expect(r.bandAdd, 'the band’s own Add record is not drawn').toBeNull();
      });
    }

    /* Fails against no fork at all, and against a fork one pixel either way. */
    test(`at ${FORK - 1}, one below the fork, there is no sidebar: the list is at the 20 inset, and there is no head figure, no fragment and no diagonal`, async ({ page }) => {
      await open(page, FORK - 1, view);
      const r = await reading(page);
      if (r.list === null || r.search === null) throw new Error('nothing drawn');
      expect(r.list.left).toBeCloseTo(20, 0);
      expect(r.list.right).toBeCloseTo(r.window - 20, 0);
      expect(r.sideRule?.width ?? '0px', 'no rule').toBe('0px');
      expect(r.search.left, 'search at the band’s 20').toBeCloseTo(20, 0);
      expect(r.bandAdd, 'Add record is the band’s').not.toBeNull();
      expect([r.headBox, r.head, r.fragment, r.add, r.chevron], 'none of the sidebar’s furniture').toEqual([null, null, null, null, null]);
      expect(await page.locator('[data-diagonal]').evaluateAll((all) => all.filter((d) => (d as HTMLElement).getClientRects().length > 0).length)).toBe(0);
    });

    /* Fails against the heading above the band's place and the filters under it in any other order. */
    test('at 1440: the sidebar reads, top to bottom, SEARCH and its field, the view names, the count, the heading, Sort between two hairlines, then the filter lines; ADD RECORD stands at the content column’s top right on the search field’s rule', async ({ page }) => {
      await open(page, 1440, view);
      const r = await reading(page);
      const tops = [r.searchLabel?.top, r.search?.top, r.views[0]?.top, r.count?.top, r.heading?.top, r.sortRow?.top, r.sort?.top, r.lines[0]?.top];
      for (const [i, top] of tops.entries()) { if (top === undefined) throw new Error(`item ${i} is not drawn`); if (i > 0) expect(top, `item ${i} is below item ${i - 1}`).toBeGreaterThan(tops[i - 1] as number); }
      expect(r.views.length).toBe(3);
      expect(new Set(r.views.map((v) => Math.round(v?.top ?? 0))).size, 'the three view names on one row').toBe(1);
      const row = await page.locator('[data-sort-row]').evaluate((el) => { const cs = getComputedStyle(el); return [cs.borderTopWidth, cs.borderBottomWidth, cs.borderTopStyle]; });
      expect(row, 'a hairline above Sort and one below').toEqual(['1px', '1px', 'solid']);
      expect([r.chevron?.width, r.chevron?.height], 'Sort’s chevron, a 12 square').toEqual([12, 12]);
      expect(r.chevron?.right ?? 0, 'at the row’s right').toBeCloseTo(SIDEBAR.width - SIDEBAR.inset, 0);
      for (const mark of r.marks) expect(mark?.right ?? 0, 'each + at the line’s right').toBeCloseTo(SIDEBAR.width - SIDEBAR.inset, 0);
      if (r.add === null || r.search === null || r.list === null) throw new Error('ADD RECORD is not drawn');
      expect(r.add.right, 'ADD RECORD ends at the column’s right').toBeCloseTo(r.list.right, 0);
      expect(Math.abs(r.add.bottom - r.search.bottom), 'its rule is on the search field’s').toBeLessThan(0.5);
      expect(r.add.height, 'a 44 control').toBe(44);
      expect([r.addMark?.width, r.addMark?.height], 'with a + in a 12 square').toEqual([12, 12]);
      await expect(page.locator('[data-add-record]')).toHaveAttribute('href', '/records/new');
      await expect(page.locator('[data-add-record]')).toHaveText(/^\s*Add record\s*$/i);
    });
  });
}

test.describe('§T.1: the search glyph is a control that submits', () => {
  /* Fails against a field with no control of its own (`T.3/search-no-button`). */
  test('at 1440 the glyph is 18 at the field’s right with a 44 hit area, and a press on it searches for what is typed', async ({ page }) => {
    await open(page, 1440, 'table');
    const r = await reading(page);
    if (r.glyph === null || r.search === null) throw new Error('no glyph');
    const drawn = await page.locator('[data-search-glyph] svg').evaluate((s) => { const b = s.getBoundingClientRect(); return [b.width, b.height]; });
    expect(drawn, 'drawn at 18').toEqual([18, 18]);
    expect(r.glyph.right, 'at the field’s right').toBeCloseTo(r.search.right, 0);
    expect(Math.min(r.glyph.width, r.glyph.height), 'a 44 hit area').toBeGreaterThanOrEqual(44);
    await page.locator('#rail-search').fill('zzqq-nothing');
    await page.locator('[data-search-glyph]').click();
    await expect(page).toHaveURL(/[?&]q=zzqq-nothing/, { timeout: 15_000 });
    await expect(page, 'and the view is kept').toHaveURL(/view=table/);
  });
});

test.describe('§T.5: the grid’s columns are counted against the content column above the fork', () => {
  /* Fails against a grid counted against the window: seven at 1440, five at 1054. */
  test('five just below the fork, three from it, four from 1129, five from 1313, and five at 1440 and 1920', async ({ page }) => {
    const seen: number[] = [];
    const widths = [FORK - 1, FORK, 1128, 1129, 1312, 1313, 1440, 1920];
    for (const width of widths) {
      await open(page, width, 'grid');
      const r = await reading(page);
      if (r.gridColumns === null || r.list === null) throw new Error('no grid');
      seen.push(r.gridColumns);
      expect(r.gridColumns, `at ${width}, a column of ${r.list.width}`).toBe(gridColumns(r.list.width));
    }
    expect(seen).toEqual([5, 3, 3, 4, 4, 5, 5, 5]);
  });
});

test.describe('§T.4: Record keeps its stated minimum', () => {
  test('at the fork the Record column is no narrower than 128', async ({ page }) => {
    await open(page, FORK, 'table');
    const m = await page.locator('main [data-collection-table] thead th').first().evaluate((th) => ({ width: th.getBoundingClientRect().width, min: getComputedStyle(th).minWidth }));
    expect(m.min, 'the floor is declared on the column').toBe(`${RECORD_MINIMUM}px`);
    expect(m.width).toBeGreaterThanOrEqual(RECORD_MINIMUM);
  });
});

/** A segment against a box: whether any part of the segment lies inside it. */
const crosses = (s: { x1: number; y1: number; x2: number; y2: number }, b: { left: number; right: number; top: number; bottom: number }) => {
  for (let i = 0; i <= 400; i += 1) {
    const x = s.x1 + ((s.x2 - s.x1) * i) / 400;
    const y = s.y1 + ((s.y2 - s.y1) * i) / 400;
    if (x > b.left && x < b.right && y > b.top && y < b.bottom) return true;
  }
  return false;
};

const drawing = (page: Page) =>
  page.evaluate(() => {
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-diagonal]')).filter((d) => d.getClientRects().length > 0).map((d) => {
      const cs = getComputedStyle(d);
      const m = new DOMMatrixReadOnly(cs.transform);
      /* The untransformed box, in the page: its offset parent's box and its own offsets. */
      const parent = (d.offsetParent as HTMLElement).getBoundingClientRect();
      const x1 = parent.left + d.offsetLeft + (d.offsetParent as HTMLElement).clientLeft;
      const y1 = parent.top + d.offsetTop + (d.offsetParent as HTMLElement).clientTop;
      const length = parseFloat(cs.width);
      return { name: d.dataset.diagonal ?? '', angle: (Math.atan2(m.b, m.a) * 180) / Math.PI, weight: cs.borderTopWidth, x1, y1, x2: x1 + m.a * length, y2: y1 + m.b * length };
    });
    const texts: { what: string; left: number; right: number; top: number; bottom: number }[] = [];
    const push = (what: string, b: DOMRect) => { if (b.width > 0 && b.height > 0) texts.push({ what, left: b.left, right: b.right, top: b.top, bottom: b.bottom }); };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walker.nextNode(); n !== null; n = walker.nextNode()) {
      if ((n.textContent ?? '').trim() === '' || n.parentElement === null || n.parentElement.closest('nextjs-portal, script, style, [aria-hidden="true"], .sr-only') !== null) continue;
      const r = document.createRange(); r.selectNodeContents(n);
      for (const b of Array.from(r.getClientRects())) push(`type "${(n.textContent ?? '').trim().slice(0, 18)}"`, b);
    }
    for (const el of Array.from(document.querySelectorAll('main a, main button, main input, main select, main [data-collection-table] table, main [data-collection-grid]'))) push(`${el.tagName.toLowerCase()} ${(el.textContent ?? '').trim().slice(0, 14)}`, el.getBoundingClientRect());
    return { lines, texts };
  });

for (const view of VIEWS) {
  test.describe(`§T.6, the ${view}: the head figure, the fragment and their diagonals`, () => {
    for (const width of ABOVE) {
      /* Fails against the figure beside the filter block (steps 110 to 112), which was the block's height and in ink. */
      test(`at ${width}: the head figure is 0.328 of the content column on its longer side at its construction’s own ratio, centred in the column, 24 or more from the header, the list and ADD RECORD, and drawn only where it clears`, async ({ page }) => {
        await open(page, width, view);
        const r = await reading(page);
        const figure = await page.locator('[data-head-figure]').evaluate((el) => ({ clearing: Number((el as HTMLElement).dataset.clearing), aspect: Number((el as HTMLElement).dataset.aspect), record: (el as HTMLElement).dataset.record }));
        if (r.list === null || r.header === null || r.add === null) throw new Error('nothing drawn');
        const column = r.list.width;
        /* Step 117: a construction taller than wide is capped at the fraction in height, and its width follows. */
        const side = column * FIGURE_FRACTION;
        const wide = side * Math.min(1, figure.aspect);
        const tall = side * Math.min(1, 1 / figure.aspect);
        expect(figure.clearing, 'the precondition: the source has a clearing height').toBeGreaterThan(0);
        if (tall < figure.clearing) { expect(r.head, `no figure: ${tall.toFixed(1)} would not clear ${figure.clearing}`).toBeNull(); return; }
        if (r.head === null) throw new Error(`the figure clears (${tall.toFixed(1)} against ${figure.clearing}) and is not drawn`);
        expect(Math.abs(r.head.width - wide), `its width, ${r.head.width} of a ${column} column`).toBeLessThan(0.5);
        expect(Math.abs(r.head.height - tall), 'its height, at the construction’s own ratio').toBeLessThan(0.5);
        /* Fails against the figure 0.328 wide at any aspect (step 113), which drew the seeded source, taller than wide, above the fraction. */
        expect(r.head.height, `never taller than 0.328 of the column, ${side.toFixed(1)}`).toBeLessThanOrEqual(side + 0.5);
        expect(r.head.width, 'nor wider').toBeLessThanOrEqual(side + 0.5);
        expect(Math.abs((r.head.left + r.head.right) / 2 - (r.list.left + r.list.right) / 2), 'centred in the column').toBeLessThan(0.5);
        expect(r.head.top - r.header.bottom, 'the 24 is a floor: from the header’s rule').toBeGreaterThanOrEqual(24 - 0.5);
        expect(r.list.top - r.head.bottom, 'from the list').toBeGreaterThanOrEqual(24 - 0.5);
        const beside = r.add.left - r.head.right;
        const below = r.head.top - r.add.bottom;
        expect(Math.max(beside, below), 'from ADD RECORD, beside it or below it').toBeGreaterThanOrEqual(24 - 0.5);
        expect(r.headRecord, 'the drawing is the source record’s').toBe(figure.record);
      });

      /* Fails against no fragment and no diagonal: nothing in the system drew either before the wireframe. */
      test(`at ${width}: the fragment is the same record’s, 24 below the last filter line, off the window’s left edge and inside the sidebar; each figure carries two 1px diagonals at 30° that cross no type, control or list, one ending on the header’s rule and one on the sidebar’s`, async ({ page }) => {
        await open(page, width, view);
        const r = await reading(page);
        const d = await drawing(page);
        if (r.head === null) { expect(r.fragment, 'no figure clears here, so no fragment').toBeNull(); expect(d.lines.length).toBe(0); return; }
        if (r.fragment === null || r.fragmentFigure === null || r.header === null) throw new Error('no fragment');
        const last = r.lines[r.lines.length - 1];
        expect(r.fragment.top - (last?.bottom ?? 0), '24 below the last filter line').toBeCloseTo(24, 0);
        expect(r.fragmentFigure.left, 'its drawing runs off the window’s left edge').toBeLessThan(0);
        expect([r.fragment.left, r.fragment.right], 'the fragment’s room is the sidebar’s, to its rule').toEqual([0, SIDEBAR.width]);
        expect(r.fragmentRecord, 'the same record’s construction').toBe(r.headRecord);
        expect(d.lines.map((l) => l.name).sort()).toEqual(['fragment-air', 'fragment-rule', 'head-air', 'head-rule']);
        for (const line of d.lines) {
          expect(line.weight, `${line.name}: 1px`).toBe('1px');
          expect(Math.abs(Math.abs(line.angle) - 30) < 0.01 || Math.abs(Math.abs(line.angle) - 150) < 0.01, `${line.name}: on the 30° axis, ${line.angle}`).toBe(true);
          const hit = d.texts.filter((t) => crosses(line, t)).map((t) => t.what);
          expect(hit, `${line.name} crosses`).toEqual([]);
        }
        const headRule = d.lines.find((l) => l.name === 'head-rule');
        const sideRule = d.lines.find((l) => l.name === 'fragment-rule');
        expect(Math.abs((headRule?.y2 ?? 0) - r.header.bottom), 'a diagonal ends on the header’s rule').toBeLessThan(0.5);
        expect(Math.abs((sideRule?.x2 ?? 0) - SIDEBAR.width), 'and one on the sidebar’s').toBeLessThan(0.5);
      });
    }
  });
}

test.describe('§T.1: a filter in force above the fork', () => {
  /* Fails against Clear set as an underlined aside directly under the lines with no hairline. */
  test('at 1440, a hairline follows the last filter line, then CLEAR FILTERS on a 44 line in the label’s type; no year line is drawn; the fragment is 24 below it', async ({ page }) => {
    await open(page, 1440, 'table');
    const first = page.locator('[data-filter="genreId"] [data-filter-trigger]');
    await first.click();
    await page.locator('[data-filter-panel] [data-filter-option]').first().click();
    await expect(page).toHaveURL(/genreId=/, { timeout: 15_000 });
    await expect(page.locator('[data-filter-clear]')).toBeVisible();
    const r = await reading(page);
    if (r.after === null || r.clear === null) throw new Error('nothing after the lines');
    const last = r.lines[r.lines.length - 1];
    const m = await page.evaluate(() => { const a = getComputedStyle(document.querySelector('[data-filter-after]') as HTMLElement); const c = getComputedStyle(document.querySelector('[data-filter-clear]') as HTMLElement); return { rule: [a.borderTopWidth, a.borderTopStyle], transform: c.textTransform, size: c.fontSize, line: c.textDecorationLine, undated: document.querySelector('[data-filter-undated]') !== null }; });
    expect(r.after.top, 'the hairline is below the last line').toBeGreaterThanOrEqual((last?.bottom ?? 0) - 0.5);
    expect(m.rule).toEqual(['1px', 'solid']);
    expect(r.clear.height, 'a 44 line').toBe(44);
    expect([m.transform, m.size, m.line], '§9.3’s label').toEqual(['uppercase', '11px', 'none']);
    await expect(page.locator('[data-filter-clear]')).toHaveText(/^\s*Clear filters\s*$/i);
    expect(m.undated, 'no year line: no control sets a year filter').toBe(false);
    if (r.fragment !== null) expect(r.fragment.top - r.clear.bottom, 'the fragment 24 below whichever line is last').toBeCloseTo(24, 0);
  });

  test('at 1440 with a filter open, the fragment is 24 below the last line, which the container has pushed down', async ({ page }) => {
    await open(page, 1440, 'table', '', 1100);
    const before = await reading(page);
    await page.locator('[data-filter="genreId"] [data-filter-trigger]').click();
    await page.locator('[data-filter-panel]').waitFor();
    const r = await reading(page);
    if (before.fragment === null) { expect(r.fragment).toBeNull(); return; }
    const last = r.lines[r.lines.length - 1];
    expect((r.fragment?.top ?? 0) - Math.max(last?.bottom ?? 0, r.panel?.bottom ?? 0)).toBeCloseTo(24, 0);
    expect(r.fragment?.top ?? 0, 'it moved down with the lines').toBeGreaterThan(before.fragment.top);
  });
});

test.describe('§T.3: the floor’s return is suppressed once the reader has scrolled since opening', () => {
  /** Opens Genre in a window that leaves 40 after the lines below it, so the floor moves the page. */
  async function openShort(page: Page) {
    const m = await page.evaluate(() => { const l = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')); return { foot: l[0].getBoundingClientRect().bottom, below: l.slice(1).reduce((s, e) => s + e.getBoundingClientRect().height, 0) }; });
    await page.setViewportSize({ width: 1440, height: Math.round(m.foot + m.below) + 40 });
    await page.waitForTimeout(200);
    const before = await page.evaluate(() => Math.round(window.scrollY));
    await page.locator('[data-filter="genreId"] [data-filter-trigger]').click();
    await page.locator('[data-filter-panel]').waitFor();
    await page.waitForTimeout(300);
    const moved = (await page.evaluate(() => Math.round(window.scrollY))) - before;
    expect(moved, 'the precondition: the floor moved the page').toBeGreaterThan(20);
    return { before, moved };
  }

  /* Fails against the return as built at fff63d8: by the same distance whatever the reader did between. */
  test('the reader scrolls the page with a filter open; closing leaves the page where they put it', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'the reader’s scroll is a wheel, which Playwright’s mobile WebKit does not have');
    await open(page, 1440, 'table');
    const { before, moved } = await openShort(page);
    const list = await page.locator('main [data-collection-table] table').boundingBox();
    await page.mouse.move((list?.x ?? 500) + 200, 300);
    await page.mouse.wheel(0, 60);
    await page.waitForTimeout(400);
    const put = await page.evaluate(() => Math.round(window.scrollY));
    expect(put, 'the precondition: the reader moved the page').toBeGreaterThan(before + moved);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-filter-panel]')).toHaveCount(0);
    await page.waitForTimeout(400);
    expect(await page.evaluate(() => Math.round(window.scrollY)), 'left where the reader put it').toBe(put);
  });

  /* The other side, kept: with no scroll of the reader's, the page returns. Passes before. */
  test('with no scroll of the reader’s, closing still returns the page', async ({ page }) => {
    await open(page, 1440, 'table');
    const { before } = await openShort(page);
    await page.keyboard.press('Escape');
    await expect(page.locator('[data-filter-panel]')).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => Math.round(window.scrollY))).toBe(before);
  });
});

type RingProbe = { ringAtFocus: () => number; ringReport: () => { total: number; missed: string[]; bad: string[] } };

test.describe('§M.6’s ring on every focusable control of the table and the grid', () => {
  for (const view of VIEWS) {
    for (const width of [1440, 390]) {
      /* Fails against the browser's own outline, in any colour: "a recolour of the default does not meet it"; and against the ring's rule in `globals.css` taken out. */
      test(`the ${view} at ${width}, with a filter open: each control reached by the keyboard draws no outline of its own and §M.6’s ring, 2px of paper and 2px of ink inside its box`, async ({ page, browserName }) => {
        await open(page, width, view);
        await page.locator('[data-filter="genreId"] [data-filter-trigger]').click();
        await page.locator('[data-filter-panel]').waitFor();
        const total = await page.evaluate(() => {
          const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
          const ctx = canvas.getContext('2d', { willReadFrequently: true }) as CanvasRenderingContext2D;
          const paint = (css: string) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = '#000'; ctx.fillStyle = css; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data).join(','); };
          const root = getComputedStyle(document.documentElement);
          const paper = paint(root.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : root.backgroundColor);
          const inkProbe = document.createElement('i'); inkProbe.style.color = 'oklch(0.19 0.008 60)'; document.body.append(inkProbe); const ink = paint(getComputedStyle(inkProbe).color); inkProbe.remove();
          const COLOUR = /(?:rgba?|lab|oklab|oklch|lch|color)\([^)]*\)/;
          const read = (p: string) => ({ colour: paint((p.match(COLOUR) ?? [''])[0]), spread: (p.replace(COLOUR, '').match(/-?[\d.]+px/g) ?? []).map(parseFloat).join(',') });
          const split = (shadow: string) => shadow.split(/,(?![^(]*\))/).map((p) => p.trim());
          /* A ring is two inset shadows with no blur: 2px of paper, then ink to 4px. */
          const ring = (shadow: string) => {
            const parts = split(shadow);
            if (parts.length !== 2 || !parts.every((p) => p.includes('inset'))) return false;
            const [a, b] = parts.map(read);
            return a.colour === paper && a.spread === '0,0,0,2' && b.colour === ink && b.spread === '0,0,0,4';
          };
          const focusable = Array.from(document.querySelectorAll<HTMLElement>('main :is(a[href], button, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]))')).filter((el) => el.closest('nextjs-portal') === null && !(el as HTMLButtonElement).disabled && el.getClientRects().length > 0);
          const nameOf = (el: HTMLElement) => `${el.tagName.toLowerCase()} "${((el.textContent ?? '').trim() || el.getAttribute('aria-label') || el.id || '').slice(0, 18)}"`;
          const names = focusable.map(nameOf);
          const seen = new Set<number>();
          const bad: string[] = [];
          const probe: RingProbe = {
            /* Reads the control the keyboard has just landed on, where it stands, and says how many have been read. */
            ringAtFocus: () => {
              const el = document.activeElement as HTMLElement | null;
              const index = el === null ? -1 : focusable.indexOf(el);
              if (el === null || index < 0 || seen.has(index)) return seen.size;
              seen.add(index);
              const name = names[index];
              /* The precondition the scripted focus broke without a sound on WebKit: the ring's rule is on `:focus-visible`. */
              if (!el.matches(':focus-visible')) bad.push(`${name}: focused and not :focus-visible`);
              const cs = getComputedStyle(el);
              if (cs.outlineStyle !== 'none' && cs.outlineWidth !== '0px') bad.push(`${name}: an outline, ${cs.outlineStyle} ${cs.outlineWidth}`);
              /* On its own box, on the overlay that is its hit area, or on the label that is its box. */
              const places = [cs.boxShadow, getComputedStyle(el, '::before').boxShadow, getComputedStyle(el, '::after').boxShadow, el.closest('label') === null ? 'none' : getComputedStyle(el.closest('label') as HTMLElement).boxShadow];
              /* The same ring as the table's rows have drawn it since step 98: the 2px of paper as the overlay's border, and the ink as one shadow inside it. */
              const after = getComputedStyle(el, '::after');
              const inkInset = split(after.boxShadow).some((part) => /inset/.test(part) && read(part).colour === ink && read(part).spread === '0,0,0,2');
              const asBuilt = after.borderTopWidth === '2px' && paint(after.borderTopColor) === paper && inkInset;
              if (!places.some(ring) && !asBuilt) bad.push(`${name}: no ring (${places.filter((p) => p !== 'none').join(' | ').slice(0, 80) || 'no shadow'})`);
              return seen.size;
            },
            ringReport: () => ({ total: focusable.length, missed: names.filter((_, i) => !seen.has(i)), bad }),
          };
          Object.assign(window, probe);
          return focusable.length;
        });
        expect(total, 'the precondition: the screen has controls to reach').toBeGreaterThan(8);
        /*
         * By the keyboard and not by `focus()`: a scripted focus on a link or
         * a button is not `:focus-visible` on WebKit, so this test read "no
         * shadow" there and was skipped, a guard passing where the real thing
         * was not (10 Oct). WebKit steps to links and buttons on Option+Tab,
         * as Safari does unless the reader has turned on "Press Tab to
         * highlight each item"; that setting is the reader's and not shown.
         */
        const step = browserName === 'webkit' ? 'Alt+Tab' : 'Tab';
        let reached = 0;
        for (let presses = 0; presses < total * 2 + 40 && reached < total; presses += 1) {
          await page.keyboard.press(step);
          reached = await page.evaluate(() => (window as unknown as RingProbe).ringAtFocus());
        }
        const r = await page.evaluate(() => (window as unknown as RingProbe).ringReport());
        expect(r.missed, 'every control was reached by the keyboard').toEqual([]);
        expect(r.bad).toEqual([]);
      });
    }
  }
});
