import { expect, test, type Page } from '@playwright/test';
import { login } from './sign-in';
import { wallMeasured } from './wall-measured';
import { nearViewMinWidth, shelfOfferedMinWidth } from '../src/app/wall/view-fork';

/**
 * Step 156 unit 2, target §P.5: the control in its three hosts, with the
 * moods not yet built, so SURPRISE ME and the reserved slot.
 *
 * "On the shelf it sits in the rail, beneath the view names and above ADD
 * RECORD, which stays at the foot... On the table and the grid it sits
 * beneath the last filter line, after a hairline: in the sidebar above the
 * sidebar fork, and in the band below it." The band's own rail is not a
 * host. "Whether the control fits the rail is measured, not predicted", at
 * the narrowest window that offers the shelf.
 */

/*
  §W.24: the shelf is offered from 1044 under a fine pointer, but from 1044
  to 1273 the shelf offered is the far view, whose rail is drawn as a band
  (§W.26 moved the near view's fork to the landing's 1274). So the rail is
  drawn from 1274, and that is the narrowest window the rail can be measured
  in. Written here, not read from the source, so a moved fork is noticed.
*/
const SHELF_FROM = 1044;
const RAIL_FROM = 1274;
const RAIL = 148;
const RAIL_INSET = 18;

test.beforeEach(async ({ page }) => login(page));

async function open(page: Page, width: number, query: string, height = 900) {
  await page.setViewportSize({ width, height });
  await page.goto(`/${query}`);
  /* The shelf's mark is its region's: on a bare `/` the grid's filters are carried hidden beside it. */
  const ready = query === '' && width >= SHELF_FROM ? '[data-wall-container] [data-hydrated="true"]' : '[data-collection-filters][data-hydrated="true"]';
  await page.locator(ready).first().waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

/** Only what is drawn: a bare `/` carries the shelf's and the grid's copies, and a media query hides one. */
const reading = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element | null) => el !== null && (el as HTMLElement).getClientRects().length > 0;
    const box = (el: Element | null) => {
      if (!drawn(el)) return null;
      const b = (el as Element).getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, width: b.width, height: b.height };
    };
    const controls = Array.from(document.querySelectorAll('[data-pick-control]')).filter(drawn);
    const control = controls[0] ?? null;
    /* The shelf's rail, found on its own so the fit is read whether or not the control is in it; the band's copy is not it. */
    const rail = Array.from(document.querySelectorAll('[data-testid="wall-rail"]')).filter(drawn).find((el) => el.closest('[data-collection-band]') === null) ?? null;
    const views = rail === null ? [] : Array.from(rail.querySelectorAll('ul a')).filter(drawn);
    const filters = Array.from(document.querySelectorAll('[data-collection-filters]')).find(drawn) ?? null;
    return {
      count: controls.length,
      inRail: control !== null && rail !== null && rail.contains(control),
      inBandRail: control?.closest('[data-collection-band]') !== null && control !== null,
      inSidebar: control?.closest('[data-collection-sidebar]') !== null && control !== null,
      control: box(control),
      button: box(control?.querySelector('button') ?? null),
      slot: box(control?.querySelector('[data-pick-slot]') ?? null),
      rule: box(control?.querySelector('[data-pick-rule]') ?? null),
      rail: box(rail),
      lastView: box(views[views.length - 1] ?? null),
      railRule: box(rail?.querySelector('[data-rail-rule]') ?? null),
      add: box(rail?.querySelector('a[href="/records/new"]') ?? null),
      filters: box(filters),
      viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
    };
  });

test.describe('§P.5: on the shelf, in the rail', () => {
  for (const width of [RAIL_FROM, 1440]) {
    test(`at ${width}: one control, beneath the view names and above the rule and ADD RECORD, inside the rail's inset`, async ({ page }) => {
      await open(page, width, '');
      const r = await reading(page);
      expect(r.count, 'one control drawn').toBe(1);
      expect(r.inRail).toBe(true);
      if (r.control === null || r.lastView === null || r.railRule === null || r.add === null || r.rail === null || r.button === null) throw new Error(`not drawn: ${JSON.stringify(r)}`);
      expect(r.control.top, 'beneath the view names').toBeGreaterThan(r.lastView.bottom);
      expect(r.control.bottom, 'above the rule').toBeLessThanOrEqual(r.railRule.top);
      expect(r.add.top, 'ADD RECORD stays at the foot').toBeGreaterThan(r.control.bottom);
      expect(r.rail.width).toBe(RAIL);
      expect(r.button.left).toBeGreaterThanOrEqual(r.rail.left + RAIL_INSET - 0.5);
      expect(r.button.right, 'within the rail’s right inset').toBeLessThanOrEqual(r.rail.right - RAIL_INSET + 0.5);
    });
  }

  /*
    "The step measures it against the rail's width and the rail's free
    height at the narrowest window that offers the shelf", read as the
    narrowest that draws the rail. Measured 25 Oct: ADD RECORD's foot at
    630.5 with the control, 97.5 lower than without it, so 269.5 free at
    900, 137.5 at 768 and 9.5 at 640. The measured floor is a 631 window,
    below which ADD RECORD's foot stops clearing. It fits at all three
    heights, which is §P.5's condition; no minimum window height is ruled,
    and none is assumed here (the coordinator, 25 Oct).
  */
  for (const height of [900, 768, 640]) {
    test(`at ${RAIL_FROM}×${height}: the rail with the control still ends above the window's foot`, async ({ page }) => {
      await open(page, RAIL_FROM, '', height);
      const r = await reading(page);
      expect(r.inRail, 'the control is in the rail measured').toBe(true);
      if (r.add === null) throw new Error('ADD RECORD not drawn');
      test.info().annotations.push({ type: 'free height', description: `${(r.viewport.height - r.add.bottom).toFixed(1)}` });
      expect(r.add.bottom).toBeLessThanOrEqual(r.viewport.height);
    });
  }
});

test.describe('§P.5: on the table and the grid, beneath the last filter line after a hairline', () => {
  for (const view of ['table', 'grid'] as const) {
    test(`the ${view} above the fork, at 1440: in the sidebar, the hairline then SURPRISE ME, below the filter lines`, async ({ page }) => {
      await open(page, 1440, `?view=${view}`);
      const r = await reading(page);
      expect(r.count).toBe(1);
      expect(r.inSidebar).toBe(true);
      expect(r.inBandRail, 'not in the band’s rail').toBe(false);
      if (r.rule === null || r.filters === null || r.button === null) throw new Error('not drawn');
      expect(r.rule.top, 'the hairline beneath the filters').toBeGreaterThanOrEqual(r.filters.bottom - 0.5);
      expect(r.button.top, 'SURPRISE ME beneath the hairline').toBeGreaterThanOrEqual(r.rule.bottom);
      const rule = await page.evaluate(() => { const s = getComputedStyle(Array.from(document.querySelectorAll<HTMLElement>('[data-pick-rule]')).find((el) => el.getClientRects().length > 0) as HTMLElement); return [s.borderTopWidth, s.borderTopStyle]; });
      expect(rule).toEqual(['1px', 'solid']);
    });

    test(`the ${view} below the fork, at 390: in the band's flow, beneath the filter lines, not in the band's rail`, async ({ page }) => {
      await open(page, 390, `?view=${view}`, 844);
      const r = await reading(page);
      expect(r.count).toBe(1);
      expect(r.inBandRail).toBe(false);
      if (r.rule === null || r.filters === null || r.button === null) throw new Error('not drawn');
      expect(r.rule.top).toBeGreaterThanOrEqual(r.filters.bottom - 0.5);
      expect(r.button.top).toBeGreaterThanOrEqual(r.rule.bottom);
      expect(r.button.left, 'on the 18 inset').toBeCloseTo(18, 0);
    });
  }

  /* Step 134: a bare `/` below the shelf's width shows the grid it carries, so that copy's control is the one drawn. */
  test(`a bare address at ${SHELF_FROM - 1}: the grid's control is the one drawn`, async ({ page }) => {
    await open(page, SHELF_FROM - 1, '');
    const r = await reading(page);
    expect(r.count).toBe(1);
    /* Not the rail: the aside holds the sidebar and the band alike, so which of the two is the fork's, read in the tests above. */
    expect(r.inRail).toBe(false);
  });
});

/*
  Step 156 unit 3a, target §P.5: "Where the rail draws as a band, the control
  takes its own row beneath the band's row, after a hairline, and never shares
  a row with the view names." The band has two rows by ruling (search, then
  the views with ADD RECORD), so the control's row is beneath both (the
  coordinator, 26 Oct). The widths are the condition's, read from the code,
  so the host moves with the fork: today they are 1044 (§14, §W.24) to 1273
  (one below nearViewMinWidth()'s 1274, an open question in §P.1).
*/
const BAND_WIDTHS = [shelfOfferedMinWidth(), nearViewMinWidth() - 1];

/** The far view's band: the views' row, the control's row and the drawing, as drawn. */
const band = (page: Page) =>
  page.evaluate(() => {
    const drawn = (el: Element | null): el is HTMLElement => el !== null && (el as HTMLElement).getClientRects().length > 0;
    const box = (el: Element | null) => {
      if (!drawn(el)) return null;
      const b = el.getBoundingClientRect();
      return { left: b.left, right: b.right, top: b.top, bottom: b.bottom, height: b.height };
    };
    const rail = Array.from(document.querySelectorAll('[data-testid="wall-rail"]')).filter(drawn).find((el) => el.closest('[data-collection-band]') === null) ?? null;
    const control = rail?.querySelector('[data-pick-control]') ?? null;
    const row = rail === null ? [] : [...Array.from(rail.querySelectorAll('ul a')), rail.querySelector('a[href="/records/new"]')].filter(drawn).map((el) => el.getBoundingClientRect());
    const svg = document.querySelector('[data-region="far"] svg[data-wall="overview"]');
    /* The drawing is what the svg draws, fitted inside it with `meet`, not the svg's box. */
    const marks = svg === null ? [] : Array.from(svg.children).map((el) => el.getBoundingClientRect()).filter((b) => b.width > 0 || b.height > 0);
    const padding = rail === null ? 0 : parseFloat(getComputedStyle(rail).paddingLeft);
    return {
      inRail: control !== null && drawn(control),
      control: box(control),
      button: box(control?.querySelector('button') ?? null),
      hairline: box(rail?.querySelector('[data-pick-band-rule]') ?? null),
      rowTop: Math.min(...row.map((b) => b.top)),
      rowBottom: Math.max(...row.map((b) => b.bottom)),
      rail: box(rail),
      padding,
      drawingTop: marks.length === 0 ? null : Math.min(...marks.map((b) => b.top)),
      drawingBottom: marks.length === 0 ? null : Math.max(...marks.map((b) => b.bottom)),
      viewport: window.innerHeight,
    };
  });

test.describe('§P.5: on the far view, where the rail draws as a band, the control has its own row', () => {
  for (const width of BAND_WIDTHS) {
    test(`at ${width}: beneath the row of view names and ADD RECORD, after a hairline, inside the band's insets`, async ({ page }) => {
      await open(page, width, '');
      /* It reads the fixture, so it waits for the wall to measure (test/repo/wall-measured.test.ts). */
      await wallMeasured(page);
      const r = await band(page);
      expect(r.inRail, 'the control is drawn in the band').toBe(true);
      if (r.control === null || r.button === null || r.rail === null) throw new Error(`not drawn: ${JSON.stringify(r)}`);
      expect(r.control.top, 'never on the row of view names').toBeGreaterThanOrEqual(r.rowBottom);
      if (r.hairline === null) throw new Error('no hairline drawn above the control');
      expect(r.hairline.top, 'the hairline beneath the views’ row').toBeGreaterThanOrEqual(r.rowBottom);
      expect(r.button.top, 'SURPRISE ME beneath the hairline').toBeGreaterThanOrEqual(r.hairline.bottom);
      expect(r.button.left, 'on the band’s left inset').toBeCloseTo(r.rail.left + r.padding, 0);
      expect(r.hairline.right, 'within the band’s right inset').toBeLessThanOrEqual(r.rail.right - r.padding + 0.5);
      /*
        §P.5: "the step reports the height the control's row takes from the far view's drawing." Since the region is
        the height the band leaves (§W.28), the row is paid for in the drawing's size, so it is read as the drawing
        with the row against the same page with the row taken out.
      */
      if (r.drawingTop === null || r.drawingBottom === null) throw new Error('no far drawing');
      expect(r.drawingBottom, 'the far drawing still ends above the window’s foot').toBeLessThanOrEqual(r.viewport);
      await page.addStyleTag({ content: '[data-pick-host] { display: none !important; }' });
      const without = await band(page);
      if (without.drawingTop === null || without.drawingBottom === null || without.rail === null) throw new Error('no far drawing without the row');
      const [tall, tallWithout] = [r.drawingBottom - r.drawingTop, without.drawingBottom - without.drawingTop];
      test.info().annotations.push({
        type: 'control row',
        description: `row ${(r.rail.bottom - without.rail.bottom).toFixed(1)} tall; drawing ${tall.toFixed(1)} tall with it, ${tallWithout.toFixed(1)} without, ${(100 * (1 - tall / tallWithout)).toFixed(1)}% smaller`,
      });
    });
  }
});

/*
  §P.6: "The slot's messages are written to fit it... Proposed: 'The only
  one.', 'None showing.'... The step checks each at the rail's width and at
  320 and 1280." Set into the drawn slot and measured: a message fits when the
  slot keeps its reserved height and nothing runs past its width.
*/
const MESSAGES = ['The only one.', 'None showing.'];
const HOSTS = [
  { name: 'the rail, at 1440', width: 1440, query: '' },
  { name: 'the band, at 320', width: 320, query: '?view=grid' },
  { name: 'the sidebar, at 1280', width: 1280, query: '?view=grid' },
];

for (const host of HOSTS) {
  test(`§P.6: in ${host.name}, each slot message fits one line without being cut`, async ({ page }) => {
    await open(page, host.width, host.query);
    const fits = await page.evaluate((messages) => {
      const slot = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-slot]')).find((el) => el.getClientRects().length > 0);
      if (slot === undefined) return null;
      const empty = slot.getBoundingClientRect().height;
      return messages.map((message) => {
        slot.textContent = message;
        const range = document.createRange();
        range.selectNodeContents(slot);
        const lines = range.getClientRects().length;
        const result = { message, empty, height: slot.getBoundingClientRect().height, lines, overflow: slot.scrollWidth - slot.clientWidth };
        slot.textContent = '';
        return result;
      });
    }, MESSAGES);
    if (fits === null) throw new Error('no slot drawn');
    for (const f of fits) {
      expect(f.empty, 'the slot is reserved before anything is asked').toBeGreaterThan(0);
      expect(f.height, `${f.message}: the slot keeps its height`).toBe(f.empty);
      expect(f.lines, `${f.message}: one line`).toBe(1);
      expect(f.overflow, `${f.message}: nothing past the slot’s width`).toBeLessThanOrEqual(0);
    }
  });
}
