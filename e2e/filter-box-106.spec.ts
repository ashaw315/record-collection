import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 106, §T.3: the box at 768 and up, one close set, and the open
 * filter's mark. A supersession of step 102's full-width panel above 768
 * (`T.3/panel-full-width`) and of the trigger never moving
 * (`T.3/trigger-never-moves`).
 *
 * "At 768 and up the open filter is a box: beneath the last filter line,
 * aligned with the filter lines, 443 wide, opaque paper in a 1px ink box,
 * as tall as its list up to the viewport's bottom less 24 and never less
 * than 176. Below 768 it stays the full-width sheet." "One close set at
 * both widths: a tap anywhere outside the list's rows (the sheet's paper,
 * the inset beside a row included, or the page beside the box); CLOSE, a
 * §9.3 control in the panel's top row; Escape; Back; choosing an option; or
 * a press on another filter's line, which switches." "A press that closes
 * the panel does nothing else."
 *
 * **What runs where.** Every test here runs on both projects, so on
 * Playwright's WebKit, except the finger's drag, which needs Chromium's
 * touch stream: Playwright's WebKit has no touch drag. On the mobile
 * project the presses are taps (`touchscreen.tap`); on desktop Chromium
 * they are mouse presses. Neither is Mobile Safari.
 */
const FLOOR = 176;
const FOOT = 24;
const MEASURE = 443;
const KEYS = ['genreId', 'labelId', 'storeId', 'tagId'] as const;
const trigger = (page: Page, key: string) => page.locator(`[data-filter="${key}"] [data-filter-trigger]`);
const panel = (page: Page) => page.locator('[data-filter-panel]');

async function open(page: Page, width: number, height: number, view: 'table' | 'grid' = 'table') {
  await page.setViewportSize({ width, height });
  await page.goto(`/?view=${view}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

/** A press as the project's reader makes it: a finger's tap where there is touch, a mouse press where there is not. */
async function press(page: Page, x: number, y: number, hasTouch: boolean | undefined) {
  if (hasTouch) await page.touchscreen.tap(x, y);
  else await page.mouse.click(x, y);
}

const box = (page: Page) =>
  page.evaluate(() => {
    const p = document.querySelector<HTMLElement>('[data-filter-panel]');
    if (p === null) return null;
    const r = p.getBoundingClientRect();
    const cs = getComputedStyle(p);
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')).map((b) => b.getBoundingClientRect());
    const last = lines[lines.length - 1];
    const first = p.querySelector<HTMLElement>('[data-filter-option]')?.getBoundingClientRect();
    const close = p.querySelector<HTMLElement>('[data-filter-close]')?.getBoundingClientRect();
    return {
      position: cs.position, left: r.left, top: r.top, width: r.width, height: r.height, bottom: r.bottom,
      borders: [cs.borderTopWidth, cs.borderRightWidth, cs.borderBottomWidth, cs.borderLeftWidth],
      borderColour: cs.borderTopColor, borderStyle: cs.borderTopStyle, radius: cs.borderTopLeftRadius, shadow: cs.boxShadow, opacity: cs.opacity,
      background: cs.backgroundColor, paper: getComputedStyle(document.body).backgroundColor,
      content: p.scrollHeight, client: p.clientHeight, listAt: p.scrollTop,
      lineLeft: last.left, lineBottom: last.bottom, lineTops: lines.map((l) => l.top), lineBottoms: lines.map((l) => l.bottom),
      firstTop: first?.top ?? null, firstLeft: first?.left ?? null, firstRight: first?.right ?? null,
      close: close === undefined ? null : { top: close.top, height: close.height, left: close.left, right: close.right },
      viewport: { width: window.innerWidth, height: window.innerHeight }, scrollY: window.scrollY,
    };
  });
type Box = NonNullable<Awaited<ReturnType<typeof box>>>;
const read = async (page: Page): Promise<Box> => {
  const b = await box(page);
  expect(b, 'the precondition: a panel is open').not.toBeNull();
  return b as Box;
};

test.beforeEach(async ({ page }) => login(page));

test.describe('§T.3: at 768 and up the open filter is a box', () => {
  for (const width of [768, 1024, 1440]) {
    /* Fails against step 102's sheet: left 0, as wide as the window, to the window's bottom, no edge. */
    test(`at ${width}: beneath the last line, at the lines’ left, 443 wide, in a 1px ink edge on opaque paper, square and unshadowed, as tall as its list up to 24 above the window’s bottom`, async ({ page }) => {
      await open(page, width, 800);
      const present = await page.locator('[data-filter]').evaluateAll((all) => all.map((el) => el.getAttribute('data-filter') as string));
      expect(present.length, 'the precondition: there are filters to open').toBeGreaterThan(0);
      for (const key of present) {
        await trigger(page, key).click();
        await expect(panel(page)).toHaveCount(1);
        const b = await read(page);
        expect(b.position).toBe('fixed');
        expect(b.top, `${key}: beneath the last filter line`).toBeCloseTo(b.lineBottom, 0);
        expect(b.left, `${key}: aligned with the filter lines`).toBeCloseTo(b.lineLeft, 0);
        expect(b.width, `${key}: 443 wide`).toBe(MEASURE);
        expect(b.borders, `${key}: a 1px edge on every side`).toEqual(['1px', '1px', '1px', '1px']);
        expect(b.borderStyle).toBe('solid');
        expect(['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)'], `${key}: the edge is ink, ${b.borderColour}`).toContain(b.borderColour);
        expect(b.background, `${key}: opaque paper`).toBe(b.paper);
        expect(b.opacity).toBe('1');
        expect(b.radius, `${key}: no radius`).toBe('0px');
        expect(b.shadow, `${key}: no shadow`).toBe('none');
        const room = b.viewport.height - FOOT - b.top;
        expect(room, 'the precondition: the window is not short').toBeGreaterThanOrEqual(FLOOR);
        /* The edge is inside the 443 and inside the height: the list and the two edges, or the room. */
        /* Within 1: the line's foot is not on a whole pixel, and `scrollHeight` is a rounded figure. */
        expect(Math.abs(b.height - Math.min(b.content + 2, room)), `${key}: as tall as its list, up to the window’s bottom less 24 (${b.height} against ${b.content} + 2 or ${room})`).toBeLessThanOrEqual(1);
        expect(b.bottom, `${key}: never nearer the window’s bottom than 24`).toBeLessThanOrEqual(b.viewport.height - FOOT + 0.5);
        await page.keyboard.press('Escape');
        await expect(panel(page)).toHaveCount(0);
      }
    });
  }

  /* Fails against a box at every width: at 767 it would leave a sliver of page beside it. */
  test('at 767 it is still the sheet: full width, to the window’s bottom, with no edge', async ({ page }) => {
    await open(page, 767, 800);
    await trigger(page, 'genreId').click();
    const b = await read(page);
    expect({ left: b.left, width: b.width, bottom: b.bottom, borders: b.borders }).toEqual({ left: 0, width: b.viewport.width, bottom: b.viewport.height, borders: ['0px', '0px', '0px', '0px'] });
    expect(b.top).toBeCloseTo(b.lineBottom, 0);
  });

  /* Fails against a box that takes its list's whole height: Genre's would run off the window. */
  test('at 1024 by 600 Genre’s list is longer than the room: the box ends 24 above the window’s bottom and the list scrolls inside it', async ({ page }) => {
    await open(page, 1024, 600);
    await trigger(page, 'genreId').click();
    const b = await read(page);
    expect(b.content, 'the precondition: the list is longer than the box').toBeGreaterThan(b.client);
    expect(b.bottom, 'the box ends 24 above the window’s bottom').toBeCloseTo(b.viewport.height - FOOT, 0);
    await panel(page).evaluate((p) => { p.scrollTop = 80; });
    expect((await read(page)).listAt, 'the list scrolls within the box').toBe(80);
    expect((await read(page)).scrollY, 'and the page does not').toBe(b.scrollY);
  });
});

test.describe('§T.3: the box’s floor, and the one move that makes it usable', () => {
  /* Fails against a box that never moves the page: with 100 of room it would be 100 tall, less than its CLOSE row and three options. */
  test('where the room beneath the last line is less than 176, opening scrolls the page by the shortfall and no more, the box is 176, and every filter line is still in view', async ({ page }) => {
    await open(page, 1024, 800);
    const lineBottom = await page.evaluate(() => { const l = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')); return l[l.length - 1].getBoundingClientRect().bottom; });
    /* A window that leaves 100 beneath the last line, less the 24. */
    const height = Math.round(lineBottom) + FOOT + 100;
    await page.setViewportSize({ width: 1024, height });
    const before = await page.evaluate(() => { const l = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')); return { bottom: l[l.length - 1].getBoundingClientRect().bottom, scrollY: window.scrollY, range: document.documentElement.scrollHeight - window.innerHeight }; });
    const room = height - FOOT - before.bottom;
    expect(room, 'the precondition: the room is short of the floor').toBeLessThan(FLOOR);
    expect(before.range, 'the precondition: the page can scroll that far').toBeGreaterThan(FLOOR - room);

    await trigger(page, 'genreId').click();
    await expect(panel(page)).toHaveCount(1);
    await expect.poll(async () => (await read(page)).scrollY, 'the page went by the shortfall, exactly').toBeCloseTo(before.scrollY + (FLOOR - room), 0);
    const b = await read(page);
    expect(b.height, 'the box is at its floor').toBeCloseTo(FLOOR, 0);
    expect(b.top, 'still beneath the last line').toBeCloseTo(b.lineBottom, 0);
    expect(b.bottom, 'and 24 above the window’s bottom').toBeCloseTo(b.viewport.height - FOOT, 0);
    expect(Math.min(...b.lineTops), 'the first filter line is in the window').toBeGreaterThanOrEqual(0);
    expect(Math.max(...b.lineBottoms), 'and the last').toBeLessThanOrEqual(b.viewport.height);
    expect(await page.evaluate(() => document.documentElement.style.overflow), 'and then the page is held').toBe('hidden');

    /* Another line, with the room now exactly the floor: no second move. */
    await trigger(page, 'labelId').click();
    await expect(trigger(page, 'labelId')).toHaveAttribute('aria-expanded', 'true');
    expect((await read(page)).scrollY, 'a switch moves nothing more').toBeCloseTo(b.scrollY, 0);
  });

  /* The ruling the move must not spread to: with room for the floor, nothing moves. Passes against a build with no box. */
  test('where the room is 176 or more, opening and closing move nothing, at 1024 by 800 and from 150 down', async ({ page }) => {
    for (const from of [0, 150]) {
      await open(page, 1024, 800);
      await page.evaluate((y) => window.scrollTo(0, y), from);
      const state = () => page.evaluate(() => ({ scrollY: window.scrollY, scrollX: window.scrollX, length: document.documentElement.scrollHeight, width: document.documentElement.scrollWidth, lines: Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')).map((b) => Math.round(b.getBoundingClientRect().top)) }));
      const closed = await state();
      expect(closed.scrollY).toBe(from);
      await trigger(page, 'genreId').click();
      await expect(panel(page)).toHaveCount(1);
      expect(await state(), `from ${from}, open`).toEqual(closed);
      await page.keyboard.press('Escape');
      await expect(panel(page)).toHaveCount(0);
      expect(await state(), `from ${from}, closed again`).toEqual(closed);
    }
  });
});

test.describe('§T.3: CLOSE in the panel’s top row, at both widths', () => {
  for (const [width, height] of [[390, 500], [1024, 600]] as const) {
    /* Fails against the panel as built, which has no CLOSE and starts its list at its top. */
    test(`at ${width}: CLOSE is the panel’s top row, 44 tall, above the first option; it stays there when the list scrolls; pressed, it closes and nothing else happens`, async ({ page, hasTouch }) => {
      await open(page, width, height);
      const url = page.url();
      await trigger(page, 'genreId').click();
      const b = await read(page);
      const edge = width >= 768 ? 1 : 0;
      expect(b.close, 'there is a CLOSE').not.toBeNull();
      const close = b.close as NonNullable<Box['close']>;
      await expect(page.locator('[data-filter-close]')).toHaveText(/^close$/i);
      expect(close.top, 'at the panel’s top').toBeCloseTo(b.top + edge, 0);
      expect(close.height, '44 tall').toBeCloseTo(44, 0);
      expect(b.firstTop, 'the first option is the row beneath it').toBeCloseTo(b.top + edge + 44, 0);

      expect(b.content, 'the precondition: the list is longer than the panel').toBeGreaterThan(b.client + 100);
      await panel(page).evaluate((p) => { p.scrollTop = 100; });
      const scrolled = await read(page);
      expect(scrolled.listAt).toBe(100);
      expect((scrolled.close as NonNullable<Box['close']>).top, 'CLOSE has not gone with the list').toBeCloseTo(close.top, 0);
      expect(await page.evaluate(() => { const c = document.querySelector('[data-filter-close]') as HTMLElement; const r = c.getBoundingClientRect(); const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return at !== null && c.contains(at); }), 'and a press at its middle reaches it, not a row passing beneath').toBe(true);

      await press(page, close.left + (close.right - close.left) / 2, close.top + 22, hasTouch);
      await expect(panel(page)).toHaveCount(0);
      expect(page.url(), 'the address is as it was').toBe(url);
    });
  }
});

test.describe('§T.3: the open filter’s label carries the underline', () => {
  /* Fails against the label as built: ink when open, with no underline. */
  test('open, its label is underlined 2px, 7px below the baseline, and the others are not; closed, none is', async ({ page }) => {
    await open(page, 1024, 800);
    const marks = () => page.locator('[data-filter]').evaluateAll((all) => all.map((el) => { const cs = getComputedStyle(el.querySelector('[data-filter-label]') as HTMLElement); return { key: el.getAttribute('data-filter') as string, line: cs.textDecorationLine, thickness: cs.textDecorationThickness, offset: cs.textUnderlineOffset }; }));
    for (const m of await marks()) expect(m.line, `closed, ${m.key}`).toBe('none');
    const present = (await marks()).map((m) => m.key);
    for (const key of present) {
      await trigger(page, key).click();
      await expect(trigger(page, key)).toHaveAttribute('aria-expanded', 'true');
      for (const m of await marks()) {
        if (m.key === key) expect({ line: m.line, thickness: m.thickness, offset: m.offset }, `${key} open, its own label`).toEqual({ line: 'underline', thickness: '2px', offset: '7px' });
        else expect(m.line, `${key} open, ${m.key}`).toBe('none');
      }
      await page.keyboard.press('Escape');
      await expect(panel(page)).toHaveCount(0);
    }
    for (const m of await marks()) expect(m.line, `closed again, ${m.key}`).toBe('none');
  });
});

test.describe('§T.3: a press outside the list’s rows closes the panel and does nothing else', () => {
  /* Fails against the panel as built: the page beside and above it is live, so the press opens the record. */
  test('at 1024, a press on a table row beside the box closes the box and opens no record; the same press again opens it', async ({ page, hasTouch }) => {
    await open(page, 1024, 800);
    const url = page.url();
    await trigger(page, 'genreId').click();
    const b = await read(page);
    /* A row beneath the last line, beside the box: right of it by 60. */
    const point = await page.evaluate((right) => {
      const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-collection-table] tbody tr'));
      const row = rows.find((r) => { const box = r.getBoundingClientRect(); return box.top > 0 && box.bottom < window.innerHeight; });
      if (row === undefined) return null;
      const r = row.getBoundingClientRect();
      const p = { x: right + 60, y: r.top + r.height / 2 };
      const under = document.elementsFromPoint(p.x, p.y);
      return { ...p, onRow: under.some((el) => el.closest('[data-collection-table] tbody tr') === row), onPanel: under.some((el) => el.closest('[data-filter-panel]') !== null) };
    }, b.left + b.width);
    expect(point, 'the precondition: a row is in the window').not.toBeNull();
    const at = point as NonNullable<typeof point>;
    expect({ onRow: at.onRow, onPanel: at.onPanel }, 'the precondition: the point is on a row, beside the box').toEqual({ onRow: true, onPanel: false });

    await press(page, at.x, at.y, hasTouch);
    await expect(panel(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(page.url(), 'the press closed the box and opened no record').toBe(url);
    expect(await page.evaluate(() => window.scrollY), 'and the page is where it was').toBe(b.scrollY);

    /* The apparatus, shown working: closed, the same press is the row's. */
    await press(page, at.x, at.y, hasTouch);
    await expect(page).toHaveURL(/\/records\/[0-9a-f-]+$/, { timeout: 15_000 });
  });

  /* Fails against the panel as built: above the sheet the page is live, so the press goes to the field. */
  test('at 390, a press on the search field above the lines closes the sheet and does not take the field', async ({ page, hasTouch }) => {
    await open(page, 390, 664);
    const url = page.url();
    await trigger(page, 'genreId').click();
    await expect(panel(page)).toHaveCount(1);
    const field = await page.evaluate(() => {
      const input = document.querySelector<HTMLElement>('input[type="search"], input[name="q"]');
      if (input === null) return null;
      const r = input.getBoundingClientRect();
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, inWindow: r.top >= 0 && r.bottom <= window.innerHeight };
    });
    expect(field, 'the precondition: there is a search field').not.toBeNull();
    const at = field as NonNullable<typeof field>;
    expect(at.inWindow, 'the precondition: it is in the window').toBe(true);
    await press(page, at.x, at.y, hasTouch);
    await expect(panel(page)).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.tagName), 'the field was not taken').not.toBe('INPUT');
    expect(page.url()).toBe(url);
  });

  /* Fails where a press on the inset is given to the row beside it (seen on Playwright's WebKit with a tap, step 105's probe): the option is chosen and the address changes. */
  test('at 390, a press on the 20 inset beside an option row closes the sheet and chooses nothing', async ({ page, hasTouch }) => {
    await open(page, 390, 664);
    const url = page.url();
    await trigger(page, 'genreId').click();
    const b = await read(page);
    expect(b.firstLeft, 'the precondition: the rows are inset from the sheet’s edge').toBeGreaterThanOrEqual(20);
    for (const x of [8, b.viewport.width - 8]) {
      if ((await panel(page).count()) === 0) { await trigger(page, 'genreId').click(); await expect(panel(page)).toHaveCount(1); }
      /* The middle of the second option row, on the inset. */
      await press(page, x, (b.firstTop as number) + 44 + 22, hasTouch);
      await expect(panel(page), `a press at x ${x}`).toHaveCount(0);
      await page.waitForTimeout(400);
      expect(page.url(), `a press at x ${x} chose nothing`).toBe(url);
    }
  });

  /* The other half of the set: a row still chooses. Passes against the build before; here so the close set is not bought with the rows. */
  test('at 390 and at 1024, a press on an option row chooses it', async ({ page, hasTouch }) => {
    for (const [width, height] of [[390, 664], [1024, 800]] as const) {
      await open(page, width, height);
      await trigger(page, 'genreId').click();
      const b = await read(page);
      await press(page, ((b.firstLeft as number) + (b.firstRight as number)) / 2, (b.firstTop as number) + 22, hasTouch);
      await expect(page, `at ${width}`).toHaveURL(/genreId=/, { timeout: 15_000 });
      await expect(panel(page)).toHaveCount(0);
    }
  });
});

/** A finger's drag by CDP: `dy` is how far the finger goes UP the screen. */
async function drag(context: BrowserContext, page: Page, x: number, y: number, dy: number) {
  const cdp = await context.newCDPSession(page);
  const point = (py: number) => [{ x, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(y) });
  for (let i = 1; i <= 12; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(y - (dy * i) / 12) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  await cdp.detach();
}

test.describe('§T.3: a tap closes and a drag scrolls', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'a touch drag needs CDP: Chromium only. Playwright’s WebKit has no touch drag, so the phone’s engine is not tested for this.');

  /* Fails against a close taken on the finger's landing rather than its lift: the drag would close the sheet before it scrolled. */
  test('a finger’s drag that starts on the inset, and one on the page beside the box, scroll or do nothing and leave the panel open', async ({ browser, baseURL }) => {
    for (const [width, height] of [[390, 560], [1024, 600]] as const) {
      const context = await browser.newContext({ hasTouch: true, isMobile: width < 768, viewport: { width, height }, baseURL });
      const page = await context.newPage();
      try {
        await login(page);
        await open(page, width, height);
        await trigger(page, 'genreId').tap();
        const b = await read(page);
        expect(b.content, 'the precondition: the list is longer than the panel').toBeGreaterThan(b.client + 40);
        const mid = b.top + b.height / 2;
        if (width < 768) {
          await drag(context, page, 8, mid, 60);
          const after = await read(page);
          expect(after.listAt, 'from the inset, the list went down').toBeGreaterThan(0);
          expect(after.scrollY, 'and the page did not').toBe(b.scrollY);
        } else {
          await drag(context, page, b.left + b.width + 80, mid, 60);
          expect((await read(page)).scrollY, 'beside the box, the page is held').toBe(b.scrollY);
        }
        await expect(panel(page), `at ${width}: the drag did not close the panel`).toHaveCount(1);
      } finally {
        await context.close();
      }
    }
  });
});
