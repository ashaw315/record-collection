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
  §W.24: the shelf is offered from shelfOfferedMinWidth() under a fine
  pointer, but below nearViewMinWidth() the shelf offered is the far view,
  whose rail is drawn as a band (§W.26 moved the near view's fork). So the
  rail is drawn from nearViewMinWidth(), the narrowest window it can be
  measured in. Read from the code, as every behaviour test here is: the
  figures themselves (1044 and 1274 today) are pinned in one place,
  src/app/wall/view-fork.test.ts, whose job that is. Don't hard-code them
  here; a moved fork should fail there once, not in every spec.
*/
const SHELF_FROM = shelfOfferedMinWidth();
const RAIL_FROM = nearViewMinWidth();
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
  /*
    Step 157b (27 Oct): the fit requirement is withdrawn (`P.5/control-must-fit`). With the moods and ASK the
    control does not fit at 900 tall, and §P.5 now rules: "Where the control and ADD RECORD run past the window's
    foot, the rail runs with the page, and ADD RECORD stays at its foot, reached by scrolling." These three asserted
    the fit; they change with the ruling, not to pass code, and now assert the reach.
  */
  for (const height of [900, 768, 640]) {
    test(`at ${RAIL_FROM}×${height}: the rail runs with the page past the window's foot, and ADD RECORD at its foot is reached by scrolling`, async ({ page }) => {
      await open(page, RAIL_FROM, '', height);
      const r = await reading(page);
      expect(r.inRail, 'the control is in the rail measured').toBe(true);
      if (r.add === null) throw new Error('ADD RECORD not drawn');
      const over = r.add.bottom - r.viewport.height;
      test.info().annotations.push({ type: 'past the foot', description: over > 0 ? `${over.toFixed(1)} of scroll to ADD RECORD` : `none: ${(-over).toFixed(1)} to spare` });
      const reach = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const add = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wall-rail"] a')).find((a) => /add record/i.test(a.textContent ?? '') && a.getClientRects().length > 0) ?? null;
        const b = add?.getBoundingClientRect() ?? null;
        return { scrolled: window.scrollY, inView: b !== null && b.top >= 0 && b.bottom <= window.innerHeight + 0.5 };
      });
      expect(reach.inView, 'ADD RECORD, at the rail’s foot, in view once the page is scrolled to its end').toBe(true);
      /* The scroll lands on a whole pixel; the overflow is a half. */
      expect(Math.abs(reach.scrolled - Math.max(0, over)), `the page scrolled by what ran past the foot (${over.toFixed(1)}), no more`).toBeLessThanOrEqual(1);
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
  (one below nearViewMinWidth()'s 1274, an open question in §P.1), pinned in
  view-fork.test.ts.
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

/*
  §P.5: "Whether the control fits the rail is measured, not predicted. The
  step measures it against the rail's width and the rail's free height at the
  narrowest window that offers the shelf, and stops and reports if it does
  not fit." Step 157b is where the moods and ASK join SURPRISE ME, so this is
  that measurement: the figures in the annotations on every run, and the fit
  asserted so a control that overflows the rail's free height is a failure
  that names it. §P.5's column-fit provisional returns on these figures.
*/
test.describe('§P.5: the control’s fit in the rail as a column, measured', () => {
  for (const [width, height] of [[nearViewMinWidth(), 900], [nearViewMinWidth(), 768], [nearViewMinWidth(), 640], [1440, 900], [1440, 768], [1440, 640]] as const) {
    test(`at ${width}×${height}: the control’s rows and height against the rail’s width and free height, and ADD RECORD at the foot in view`, async ({ page }) => {
      await page.setViewportSize({ width, height });
      await page.goto('/');
      await wallMeasured(page);
      await page.evaluate(() => document.fonts.ready);
      const m = await page.evaluate(() => {
        const drawn = (el: Element | null): el is HTMLElement => el !== null && (el as HTMLElement).getClientRects().length > 0;
        const rail = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wall-rail"]')).filter(drawn).find((el) => el.closest('[data-collection-band]') === null) ?? null;
        const control = Array.from(document.querySelectorAll<HTMLElement>('[data-pick-control]')).filter(drawn).find((el) => rail?.contains(el)) ?? null;
        const box = (el: Element | null) => (el === null ? null : (({ top, bottom, left, right, width: w, height: h }) => ({ top, bottom, left, right, width: w, height: h }))(el.getBoundingClientRect()));
        const moods = control === null ? [] : Array.from(control.querySelectorAll<HTMLElement>('[data-mood]')).map((b) => ({ mood: b.dataset.mood ?? '', ...box(b)! }));
        const views = rail === null ? null : Array.from(rail.querySelectorAll('a')).filter((a) => /^(Shelf|Table|Grid)$/.test((a.textContent ?? '').trim())).pop() ?? null;
        const add = rail === null ? null : Array.from(rail.querySelectorAll('a')).find((a) => /add record/i.test(a.textContent ?? '')) ?? null;
        const railStyle = rail === null ? null : getComputedStyle(rail);
        return {
          window: { width: window.innerWidth, height: window.innerHeight },
          rail: box(rail),
          railInset: railStyle === null ? null : { left: parseFloat(railStyle.paddingLeft), right: parseFloat(railStyle.paddingRight) },
          control: box(control),
          moods,
          rows: new Set(moods.map((b) => Math.round(b.top))).size,
          lastView: box(views),
          add: box(add),
          scrollHeight: document.documentElement.scrollHeight,
          /* What the rail does past the foot: whether it clips (its own overflow), the page scrolls (the document grows), or ADD RECORD is simply out of reach. */
          railOverflow: railStyle === null ? null : `${railStyle.overflowY}, scrollHeight ${rail?.scrollHeight} against clientHeight ${rail?.clientHeight}`,
          pitches: {
            viewNames: (() => { const tops = Array.from(rail?.querySelectorAll('[data-view-name] a') ?? []).map((a) => a.getBoundingClientRect().top); return tops.length < 2 ? null : (tops[1] - tops[0]); })(),
            moods: moods.length < 2 ? null : moods[1].top - moods[0].top,
            /* ASK and SURPRISE ME against the last mood: §P.5's "in the rail they take §W's one pitch with the moods". */
            ask: (() => { const a = control?.querySelector('button[aria-disabled]'); const last = moods[moods.length - 1]; return a && last ? a.getBoundingClientRect().top - last.top : null; })(),
            surpriseFromAsk: (() => { const bs = Array.from(control?.querySelectorAll('button:not([data-mood])') ?? []); return bs.length < 2 ? null : bs[1].getBoundingClientRect().top - bs[0].getBoundingClientRect().top; })(),
            surprise: box(control?.querySelector('button:not([data-mood])') ?? null)?.height ?? null,
            add: box(add)?.height ?? null,
          },
        };
      });
      /* Past the foot, is ADD RECORD reachable by scrolling the page, or clipped? Read after a scroll to the end, then scrolled back. */
      const reach = await page.evaluate(() => {
        window.scrollTo(0, document.documentElement.scrollHeight);
        const add = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="wall-rail"] a')).find((a) => /add record/i.test(a.textContent ?? '') && a.getClientRects().length > 0) ?? null;
        const r = add === null ? null : add.getBoundingClientRect();
        const out = { scrolledTo: window.scrollY, addBottomAfterScroll: r === null ? null : r.bottom, inView: r !== null && r.bottom <= window.innerHeight + 0.5 && r.top >= 0 };
        window.scrollTo(0, 0);
        return out;
      });
      if (m.rail === null || m.control === null || m.add === null || m.lastView === null || m.railInset === null) throw new Error('the rail, its control, its last view name or ADD RECORD was not found');
      const inner = m.rail.width - m.railInset.left - m.railInset.right;
      const widest = m.moods.reduce((w, b) => Math.max(w, b.width), 0);
      /*
        The fit, measured where it shows: ADD RECORD keeps the rail's foot, so the rail overflows the window by
        ADD RECORD's foot past it, and the control's free height is its own height less that overflow. The rail's
        gaps (above the control, and between it and ADD RECORD) are in the measurement, not predicted.
      */
      const over = m.add.bottom - m.window.height;
      const free = m.control.height - Math.max(0, over);
      test.info().annotations.push({
        type: `fit at ${width}×${height}`,
        description: `rail ${m.rail.width} wide, ${inner.toFixed(1)} inside its insets; the widest mood ${widest.toFixed(1)}; the moods in ${m.rows} rows at a ${m.pitches.moods?.toFixed(1) ?? '?'} pitch (the view names' ${m.pitches.viewNames?.toFixed(1) ?? '?'}; SURPRISE ME ${m.pitches.surprise?.toFixed(1) ?? '?'} tall; ADD RECORD ${m.pitches.add?.toFixed(1) ?? '?'}); the control ${m.control.height.toFixed(1)} tall, from ${m.control.top.toFixed(1)} (the last view name's foot ${m.lastView.bottom.toFixed(1)}); ADD RECORD at ${m.add.top.toFixed(1)} to ${m.add.bottom.toFixed(1)} in a ${m.window.height} window, ${over > 0 ? `OVER by ${over.toFixed(1)}: the control may be ${free.toFixed(1)} tall here` : `in view with ${(-over).toFixed(1)} to spare`}; the page ${m.scrollHeight} tall`,
      });
      test.info().annotations.push({
        type: `past the foot at ${width}×${height}`,
        description: over > 0 ? `the rail's overflow-y is ${m.railOverflow}; the page scrolls to ${reach.scrolledTo} and ADD RECORD's foot is then at ${reach.addBottomAfterScroll?.toFixed(1)} (${reach.inView ? 'in view: the page scrolls, nothing clips' : 'still out of view: clipped or unreachable'})` : 'nothing past the foot',
      });
      expect.soft(widest, 'every mood fits the rail’s width inside its insets').toBeLessThanOrEqual(inner + 0.5);
      /* §P.5 (27 Oct): "the rail's own label pitch, as §W sets it for SHELF, TABLE and GRID": the moods' pitch is the view names', measured, not a figure. */
      expect.soft(m.pitches.moods, `the moods take the view names’ pitch (${m.pitches.viewNames?.toFixed(1)})`).toBeCloseTo(m.pitches.viewNames ?? NaN, 0);
      expect.soft(m.pitches.ask, `ASK takes the rail’s one pitch after the last mood (${m.pitches.viewNames?.toFixed(1)})`).toBeCloseTo(m.pitches.viewNames ?? NaN, 0);
      expect.soft(m.pitches.surpriseFromAsk, `SURPRISE ME takes it after ASK (${m.pitches.viewNames?.toFixed(1)})`).toBeCloseTo(m.pitches.viewNames ?? NaN, 0);
      /* The fit is withdrawn (`P.5/control-must-fit`); what is ruled is the reach: past the foot the rail runs with the page and ADD RECORD is reached by scrolling. */
      if (over > 0) expect.soft(reach.inView, 'ADD RECORD reached by scrolling to the end').toBe(true);
    });
  }
});
