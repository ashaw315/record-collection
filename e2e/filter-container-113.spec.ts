import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { login } from './sign-in';

/**
 * Step 113, the part of it that is §T.3's container: "A filter's options
 * open in place, beneath its own title in the sidebar, in a container that
 * scrolls, and the + on its line becomes a − while it is open."
 *
 * It supersedes the covering panel of steps 101, 102 and 106 to 109: the
 * sheet, the 443 box, CLOSE, the tap outside, Back, the page held, the
 * close when the line leaves the window and the underline on the open
 * label are each withdrawn within §T.3.
 *
 * The sidebar is not built here and its width is still with Design, so
 * nothing below names a width for the container: it is as wide as its own
 * title, whatever that is.
 */
const FLOOR = 132;
const ROW = 44;
const KEYS = ['genreId', 'labelId', 'storeId', 'tagId'];
const trigger = (page: Page, key = 'genreId') => page.locator(`[data-filter="${key}"] [data-filter-trigger]`);
const container = (page: Page) => page.locator('[data-filter-panel]');
const scrollY = (page: Page) => page.evaluate(() => Math.round(window.scrollY));
/**
 * Colours as the pixels they paint. A computed colour comes back in whatever
 * notation its rule was written in (the compiled classes say `lab()`, an
 * inline style keeps `oklch()`), so two spellings of ink do not compare as
 * text.
 */
const painted = (page: Page, colours: string[]) =>
  page.evaluate((list) => {
    const ctx = document.createElement('canvas').getContext('2d');
    if (ctx === null) throw new Error('no canvas');
    return list.map((colour) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = colour; ctx.fillRect(0, 0, 1, 1); return Array.from(ctx.getImageData(0, 0, 1, 1).data).join(','); });
  }, colours);
const INK = 'oklch(0.19 0.008 60)';
const press = (page: Page, key: string, mobile: boolean) => (mobile ? trigger(page, key).tap() : trigger(page, key).click());

async function open(page: Page, width: number, height: number, query = '') {
  await page.setViewportSize({ width, height });
  await page.goto(`/?view=table${query}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

/** Everything the rulings are read against, in the window's own measure. */
const reading = (page: Page) =>
  page.evaluate(() => {
    const box = (el: Element | null) => { if (el === null) return null; const b = el.getBoundingClientRect(); return { top: b.top, bottom: b.bottom, left: b.left, right: b.right, height: b.height, width: b.width }; };
    const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter]')).map((line) => ({ key: line.dataset.filter ?? '', title: box(line.querySelector('[data-filter-trigger]')), mark: line.querySelector('[data-filter-mark]')?.getAttribute('data-filter-mark') ?? null, expanded: line.querySelector('[data-filter-trigger]')?.getAttribute('aria-expanded') }));
    const panels = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-panel]'));
    const panel = panels[0];
    const style = panel === undefined ? null : getComputedStyle(panel);
    return {
      lines,
      panels: panels.length,
      owner: panel?.closest<HTMLElement>('[data-filter]')?.dataset.filter ?? null,
      panel: box(panel ?? null),
      position: style?.position ?? null,
      overflowY: style?.overflowY ?? null,
      overscroll: style?.overscrollBehaviorY ?? null,
      border: style === null ? null : [style.borderTopWidth, style.borderRightWidth, style.borderBottomWidth, style.borderLeftWidth].join(' '),
      list: panel === undefined ? 0 : panel.scrollHeight,
      scrollTop: panel?.scrollTop ?? 0,
      options: panel === undefined ? 0 : panel.querySelectorAll('[data-filter-option]').length,
      scrollY: window.scrollY,
      innerHeight: window.innerHeight,
      close: document.querySelectorAll('[data-filter-close]').length,
      outside: document.querySelectorAll('[data-filter-outside]').length,
      rootOverflow: document.documentElement.style.overflow,
    };
  });

test.beforeEach(async ({ page }) => login(page));

test.describe('§T.3: a filter’s options open in place beneath its own title', () => {
  for (const [width, height] of [[1440, 1000], [768, 1000], [390, 844]] as const) {
    /* Fails against the covering panel: it is fixed, beneath the LAST line, and moves nothing. */
    test(`at ${width}, each filter’s container starts at its own title’s foot, is as wide as that title, and pushes the lines below it down by its height`, async ({ page, isMobile }) => {
      await open(page, width, height);
      const closed = await reading(page);
      expect(closed.lines.length, 'the precondition: more than one filter line').toBeGreaterThan(1);
      for (const [i, line] of closed.lines.entries()) {
        await press(page, line.key, isMobile);
        await expect(container(page)).toHaveCount(1);
        const r = await reading(page);
        const title = r.lines[i].title;
        if (title === null || r.panel === null) throw new Error('no title or container');
        expect(r.owner, 'the container is inside its own filter').toBe(line.key);
        expect(r.position, 'in the page’s flow, not laid over it').not.toBe('fixed');
        expect(r.position).not.toBe('absolute');
        expect(Math.abs(r.panel.top - title.bottom), 'it starts at its title’s foot').toBeLessThan(0.5);
        expect(Math.abs(r.panel.left - title.left), 'at its title’s left').toBeLessThan(0.5);
        expect(Math.abs(r.panel.right - title.right), 'and as wide as its title').toBeLessThan(0.5);
        const next = r.lines[i + 1]?.title;
        if (next !== undefined && next !== null) expect(Math.abs(next.top - r.panel.bottom), 'the next line starts at the container’s foot').toBeLessThan(0.5);
        expect(r.border, 'no box is drawn round it').toBe('0px 0px 0px 0px');
        expect(r.close, 'no CLOSE').toBe(0);
        expect(r.outside, 'nothing laid over the page').toBe(0);
        expect(r.rootOverflow, 'the page itself is not held').not.toBe('hidden');
        await press(page, line.key, isMobile);
        await expect(container(page)).toHaveCount(0);
      }
    });
  }

  /* Fails against the panel: its height runs to the window's foot less 24, whatever lies below. */
  test('at 1024, in a window leaving 150, the container is as tall as its list up to the room left after the lines below it, and those lines end inside the window', async ({ page, isMobile }) => {
    await open(page, 1024, 800);
    /* The window is made from the lines' own place, so the room is 150 whichever lines the shared database draws: more than the floor, less than four options. */
    const foot = (await reading(page)).lines.reduce((y, l) => Math.max(y, l.title?.bottom ?? 0), 0);
    await page.setViewportSize({ width: 1024, height: Math.round(foot) + 150 });
    await page.waitForTimeout(200);
    const closed = await reading(page);
    let bounded = 0;
    for (const [i, line] of closed.lines.entries()) {
      await press(page, line.key, isMobile);
      await expect(container(page)).toHaveCount(1);
      const r = await reading(page);
      const title = r.lines[i].title;
      const last = r.lines[r.lines.length - 1].title;
      if (title === null || r.panel === null || last === null) throw new Error('no title or container');
      const below = r.lines.slice(i + 1).reduce((sum, l) => sum + (l.title?.height ?? 0), 0);
      const room = r.innerHeight - title.bottom - below;
      expect(r.list, 'one option per 44 row, and nothing hanging out of the last to scroll by').toBe(r.options * ROW);
      expect(room, 'the precondition: this window leaves more than the floor').toBeGreaterThan(FLOOR);
      expect(Math.abs(r.panel.height - Math.min(r.list, room)), `${line.key}: as tall as its list, up to the room`).toBeLessThan(0.5);
      expect(last.bottom, 'the last line ends inside the window').toBeLessThanOrEqual(r.innerHeight + 0.5);
      expect(r.scrollY, 'and the page did not move').toBe(0);
      if (r.list > room) { bounded += 1; expect(r.overflowY, 'a list longer than the room scrolls in the container').toBe('auto'); }
      await press(page, line.key, isMobile);
      await expect(container(page)).toHaveCount(0);
    }
    expect(bounded, 'the precondition: at least one list is longer than its room').toBeGreaterThan(0);
  });
});

test.describe('§T.3: + closed and − open, at the line’s right', () => {
  /* Fails against step 106's line: no mark, and the open label underlined. */
  test('each closed line carries a + in a 12 square at its right; open, it is a −, the label carries no underline, and the mark has not moved', async ({ page, isMobile }) => {
    await open(page, 1024, 800);
    const marks = () =>
      page.evaluate(() =>
        Array.from(document.querySelectorAll<HTMLElement>('[data-filter]')).map((line) => {
          const title = (line.querySelector('[data-filter-trigger]') as HTMLElement).getBoundingClientRect();
          const mark = line.querySelector<SVGElement>('[data-filter-mark]');
          const b = mark?.getBoundingClientRect();
          const strokes = Array.from(mark?.querySelectorAll<SVGElement>('line, path') ?? []);
          const label = line.querySelector<HTMLElement>('[data-filter-label]');
          return { kind: mark?.getAttribute('data-filter-mark') ?? null, width: b?.width ?? 0, height: b?.height ?? 0, fromRight: b === undefined ? null : title.right - b.right, inTitle: mark?.closest('[data-filter-trigger]') !== null, strokes: strokes.length, stroke: strokes.map((s) => getComputedStyle(s).stroke), strokeWidth: strokes.map((s) => getComputedStyle(s).strokeWidth), underline: label === null ? null : getComputedStyle(label).textDecorationLine };
        }),
      );
    const [inkNow] = await painted(page, [INK]);
    const closed = await marks();
    for (const m of closed) {
      expect(m.kind).toBe('plus');
      expect([m.width, m.height], 'a 12 square').toEqual([12, 12]);
      expect(m.fromRight, 'at the line’s right').toBe(0);
      expect(m.inTitle, 'inside the title, so a press on it is a press on the title').toBe(true);
      expect(m.strokes, 'two strokes').toBe(2);
      for (const w of m.strokeWidth) expect(w, '1px').toBe('1px');
      for (const c of await painted(page, m.stroke)) expect(c, 'in ink').toBe(inkNow);
    }
    await press(page, closed.length > 1 ? KEYS[1] : KEYS[0], isMobile);
    await expect(container(page)).toHaveCount(1);
    const open1 = await marks();
    const r = await reading(page);
    const at = r.lines.findIndex((l) => l.key === r.owner);
    expect(open1[at].kind, 'the open line’s mark').toBe('minus');
    expect(open1[at].strokes, 'one stroke').toBe(1);
    expect(open1[at].strokeWidth[0]).toBe('1px');
    expect((await painted(page, open1[at].stroke))[0]).toBe(inkNow);
    expect(open1[at].fromRight).toBe(0);
    expect(open1[at].underline, 'no underline on the open label').toBe('none');
    /* Kept from step 102: the open filter's label is in ink and the others in the label colour. */
    const colours = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('[data-filter-label]')).map((l) => getComputedStyle(l).color));
    const [labelColour, ...drawn] = await painted(page, ['oklch(0.44 0.008 70)', ...colours]);
    for (const [i, c] of drawn.entries()) expect(c, i === at ? 'the open label in ink' : 'a closed label in the label colour').toBe(i === at ? inkNow : labelColour);
    for (const [i, m] of open1.entries()) if (i !== at) expect(m.kind, 'the others keep their +').toBe('plus');
  });

  /* Fails against step 106's line, which shows the value alone, in the detail size, a gap after the label. */
  test('a chosen option shows on its line as GENRE · the option, the value in ink, and the + stays at the right', async ({ page, isMobile }) => {
    await open(page, 1024, 800);
    await press(page, 'genreId', isMobile);
    const first = container(page).locator('[data-filter-option]').first();
    const name = (await first.locator('[data-filter-name]').innerText()).trim();
    await (isMobile ? first.tap() : first.click());
    await expect(page).toHaveURL(/genreId=/, { timeout: 15_000 });
    await expect(container(page), 'choosing closes the list').toHaveCount(0);
    const line = trigger(page, 'genreId');
    await expect(line).toHaveText(new RegExp(`^\\s*Genre\\s*·\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*$`, 'i'));
    const m = await line.evaluate((el) => { const v = el.querySelector('[data-filter-chosen]') as HTMLElement; const l = el.querySelector('[data-filter-label]') as HTMLElement; const c = getComputedStyle(v); const lc = getComputedStyle(l); return { colour: c.color, size: c.fontSize, transform: c.textTransform, labelSize: lc.fontSize, labelTransform: lc.textTransform, mark: el.querySelector('[data-filter-mark]')?.getAttribute('data-filter-mark') }; });
    const [value, inkNow] = await painted(page, [m.colour, INK]);
    expect(value, 'the value in ink').toBe(inkNow);
    expect([m.size, m.transform], 'in the label’s own type').toEqual([m.labelSize, m.labelTransform]);
    expect(m.mark).toBe('plus');
  });
});

test.describe('§T.3: one open at a time, and the close set', () => {
  /* Fails against the panel: the pressed line never moved, because nothing pushed. Here the one above closes and the page follows. */
  test('opening a filter below an open one closes that one, and the pressed title stays where it was pressed', async ({ page, isMobile }) => {
    await open(page, 1024, 420);
    const lines = (await reading(page)).lines;
    expect(lines.length, 'the precondition: two filter lines').toBeGreaterThan(1);
    await press(page, lines[0].key, isMobile);
    await expect(container(page)).toHaveCount(1);
    /* Scrolled so the page has somewhere to go when the container above closes. */
    await page.evaluate(() => { const t = document.querySelector('[data-filter-trigger]') as HTMLElement; window.scrollBy({ top: t.getBoundingClientRect().top - 4, behavior: 'instant' }); });
    const before = await reading(page);
    const closing = before.panel?.height ?? 0;
    const target = before.lines[1].title;
    if (target === null) throw new Error('no second line');
    expect(before.scrollY, 'the precondition: the page is scrolled further than the height that will close').toBeGreaterThan(closing);
    expect(target.top, 'the precondition: the second title is in the window').toBeLessThan(before.innerHeight - 22);
    await press(page, lines[1].key, isMobile);
    await expect.poll(async () => (await reading(page)).owner).toBe(lines[1].key);
    const after = await reading(page);
    expect(after.panels, 'one open at a time').toBe(1);
    expect(after.lines[0].expanded).toBe('false');
    expect(Math.abs((after.lines[1].title?.top ?? 0) - target.top), 'the pressed title has not moved in the window').toBeLessThan(1);
    expect(Math.abs(before.scrollY - after.scrollY - closing), 'the page moved by the height that closed').toBeLessThan(1);
  });

  const closes: [string, (page: Page, mobile: boolean) => Promise<void>][] = [
    ['its title pressed again', async (page, mobile) => press(page, 'genreId', mobile)],
    ['its − pressed', async (page, mobile) => { const m = trigger(page).locator('[data-filter-mark="minus"]'); await (mobile ? m.tap() : m.click()); }],
    ['Escape', async (page) => { await page.keyboard.press('Escape'); }],
  ];
  for (const [name, close] of closes) {
    test(`${name} closes it`, async ({ page, isMobile }) => {
      await open(page, 1024, 800);
      await press(page, 'genreId', isMobile);
      await expect(container(page)).toHaveCount(1);
      await close(page, isMobile);
      await expect(container(page)).toHaveCount(0);
      if (name === 'Escape') expect(await trigger(page).evaluate((el) => document.activeElement === el), 'focus is on the title').toBe(true);
    });
  }

  /* Fails against step 106's close set: a press outside closed the panel and did nothing else, and opening added a history entry for Back. */
  test('there is no outside to tap: a press on the heading leaves it open, opening adds no history entry, and a press on a record’s row opens the record', async ({ page, isMobile }) => {
    await open(page, 1024, 800);
    const entries = await page.evaluate(() => window.history.length);
    const lines = (await reading(page)).lines;
    await press(page, lines[lines.length - 1].key, isMobile);
    await expect(container(page)).toHaveCount(1);
    expect(await page.evaluate(() => window.history.length), 'no entry for Back to close').toBe(entries);
    const heading = page.locator('main [data-collection-heading] h1');
    await (isMobile ? heading.tap() : heading.click());
    await page.waitForTimeout(300);
    await expect(container(page), 'still open').toHaveCount(1);
    const row = page.locator('main [data-collection-table] tbody tr a').first();
    await row.scrollIntoViewIfNeeded();
    await (isMobile ? row.tap() : row.click());
    await expect(page, 'nothing is covered, so the row is pressed').toHaveURL(/\/records\/[0-9a-f-]+/, { timeout: 20_000 });
  });
});

test.describe('§T.3: the floor of 132, the page scrolled by the shortfall, and returned on close', () => {
  /** Opens Genre in a window that leaves `room` after the lines below it, and says how far the page went. */
  async function openShort(page: Page, mobile: boolean, room: number) {
    const m = await page.evaluate(() => { const l = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]')); return { foot: l[0].getBoundingClientRect().bottom, below: l.slice(1).reduce((s, e) => s + e.getBoundingClientRect().height, 0) }; });
    await page.setViewportSize({ width: 1024, height: Math.round(m.foot + m.below) + room });
    await page.waitForTimeout(200);
    const before = await scrollY(page);
    await press(page, 'genreId', mobile);
    await expect(container(page)).toHaveCount(1);
    await page.waitForTimeout(300);
    return { before, moved: (await scrollY(page)) - before };
  }

  /* Fails against the panel, whose floor was 176 on the room beneath the LAST line. */
  test('where the room is 40, the page goes down by 92, the container is 132, and every line below it ends inside the window', async ({ page, isMobile }) => {
    await open(page, 1024, 800);
    const { moved } = await openShort(page, isMobile, 40);
    const r = await reading(page);
    expect(r.options, 'the precondition: Genre has more than three options').toBeGreaterThan(3);
    expect(moved, 'the shortfall').toBe(FLOOR - 40);
    expect(Math.abs((r.panel?.height ?? 0) - FLOOR), 'three rows').toBeLessThan(0.5);
    expect(r.lines[r.lines.length - 1].title?.bottom ?? 0, 'the last line ends at the window’s foot').toBeLessThanOrEqual(r.innerHeight + 0.5);
    expect(r.lines[0].title?.top ?? -1, 'and the title is still in the window').toBeGreaterThanOrEqual(0);
  });

  const closes: [string, (page: Page, mobile: boolean) => Promise<void>][] = [
    ['its title pressed again', async (page, mobile) => press(page, 'genreId', mobile)],
    ['Escape', async (page) => { await page.keyboard.press('Escape'); }],
  ];
  for (const [name, close] of closes) {
    test(`closed by ${name}, the page is back where it was before the floor moved it`, async ({ page, isMobile }) => {
      await open(page, 1024, 800);
      const { before, moved } = await openShort(page, isMobile, 40);
      expect(moved, 'the precondition: the floor moved the page').toBeGreaterThan(20);
      await close(page, isMobile);
      await expect(container(page)).toHaveCount(0);
      await expect.poll(() => scrollY(page), 'returned by the same distance').toBe(before);
      await page.waitForTimeout(500);
      expect(await scrollY(page), 'and it stays there').toBe(before);
    });
  }

  test('closed by choosing an option, the page is back where it was and the option is in force', async ({ page, isMobile }) => {
    await open(page, 1024, 800);
    const { before, moved } = await openShort(page, isMobile, 40);
    expect(moved).toBeGreaterThan(20);
    const first = container(page).locator('[data-filter-option]').first();
    await (isMobile ? first.tap() : first.click());
    await expect(page).toHaveURL(/genreId=/, { timeout: 15_000 });
    await expect(container(page)).toHaveCount(0);
    await page.waitForTimeout(500);
    expect(await scrollY(page)).toBeLessThanOrEqual(before);
  });

  /* "Where even that cannot keep the lines below in view, on a phone, the floor wins and those lines are reached by scrolling the page." */
  test('in a window too short for the title, the floor and the lines below, the container is still 132 and its title stays in the window', async ({ page, isMobile }) => {
    await open(page, 390, 800);
    await page.setViewportSize({ width: 390, height: 240 });
    await page.waitForTimeout(200);
    await trigger(page).scrollIntoViewIfNeeded();
    await press(page, 'genreId', isMobile);
    await expect(container(page)).toHaveCount(1);
    await page.waitForTimeout(300);
    const r = await reading(page);
    expect(Math.abs((r.panel?.height ?? 0) - FLOOR), 'the floor wins').toBeLessThan(0.5);
    expect(r.lines[0].title?.top ?? -1, 'the title is not scrolled out of the window’s top').toBeGreaterThanOrEqual(-0.5);
    expect(r.panel?.bottom ?? 0, 'and the container’s three rows are inside it').toBeLessThanOrEqual(r.innerHeight + 0.5);
  });
});

/** A finger's drag by CDP: `dy` is how far the finger goes UP the screen, so a positive one asks for what is below. */
async function drag(context: BrowserContext, page: Page, x: number, y: number, dy: number) {
  const cdp = await context.newCDPSession(page);
  const point = (py: number) => [{ x, y: py, id: 1, radiusX: 4, radiusY: 4, force: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(y) });
  for (let i = 1; i <= 12; i += 1) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point(y - (dy * i) / 12) }); await page.waitForTimeout(16); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await page.waitForTimeout(600);
  await cdp.detach();
}

test.describe('§T.3: a drag in the container scrolls it and does not carry on into the page at its ends; the page itself is not held', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'a wheel and a CDP touch drag: Chromium only. The phone’s engine is not tested for this.');

  test('by wheel: past the list’s foot and past its top the page stays still, and beside the container the page scrolls', async ({ page }) => {
    await open(page, 1024, 500);
    await trigger(page).click();
    await expect(container(page)).toHaveCount(1);
    await page.evaluate(() => window.scrollBy({ top: 30, behavior: 'instant' }));
    const start = await reading(page);
    if (start.panel === null) throw new Error('no container');
    expect(start.list, 'the precondition: the list is longer than the container').toBeGreaterThan(start.panel.height + ROW);
    const x = start.panel.left + 60;
    const y = start.panel.top + start.panel.height / 2;
    await page.mouse.move(x, y);
    for (let i = 0; i < 12; i += 1) { await page.mouse.wheel(0, 400); await page.waitForTimeout(60); }
    await page.waitForTimeout(400);
    const foot = await reading(page);
    expect(Math.round(foot.scrollTop), 'the list is at its foot').toBe(Math.round(foot.list - (foot.panel?.height ?? 0)));
    expect(foot.scrollY, 'and the page has not moved').toBe(start.scrollY);
    for (let i = 0; i < 16; i += 1) { await page.mouse.wheel(0, -400); await page.waitForTimeout(60); }
    await page.waitForTimeout(400);
    const top = await reading(page);
    expect(top.scrollTop, 'the list is back at its top').toBe(0);
    expect(top.scrollY, 'and the page has not moved').toBe(start.scrollY);
    /* Beside it: the page is the reader's. */
    await page.mouse.move(start.panel.right + 200, y);
    await page.mouse.wheel(0, 120);
    await page.waitForTimeout(400);
    expect((await reading(page)).scrollY, 'a wheel off the container moves the page').toBeGreaterThan(start.scrollY);
  });

  test('by finger: a drag on the list moves the list; at its foot and at its top a further drag leaves the page still; a drag on the page moves the page', async ({ browser, baseURL }) => {
    const context = await browser.newContext({ hasTouch: true, isMobile: true, viewport: { width: 390, height: 600 }, baseURL });
    const page = await context.newPage();
    try {
      await login(page);
      await page.goto('/?view=table');
      await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
      await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
      await trigger(page).tap();
      await expect(container(page)).toHaveCount(1);
      await page.waitForTimeout(300);
      const start = await reading(page);
      if (start.panel === null) throw new Error('no container');
      expect(start.list).toBeGreaterThan(start.panel.height + ROW);
      const x = start.panel.left + 80;
      const y = start.panel.top + start.panel.height / 2;
      await drag(context, page, x, y, 60);
      const moved = await reading(page);
      expect(moved.scrollTop, 'the list followed the finger').toBeGreaterThan(20);
      expect(moved.scrollY, 'and the page did not').toBe(start.scrollY);
      /* To its top, then further: a finger going down the screen at the list's top. */
      await container(page).evaluate((el) => { el.scrollTop = 0; });
      await drag(context, page, x, y - 40, -90);
      expect((await reading(page)).scrollY, 'at the list’s top the page stays').toBe(start.scrollY);
      await container(page).evaluate((el) => { el.scrollTop = el.scrollHeight; });
      await drag(context, page, x, y + 40, 90);
      expect((await reading(page)).scrollY, 'at the list’s foot the page stays').toBe(start.scrollY);
      /* The apparatus, shown working, and the ruling's last sentence: off the container the same drag moves the page. */
      const title = (await reading(page)).lines[0].title;
      await drag(context, page, 300, (title?.top ?? 100) - 30, 60);
      expect((await reading(page)).scrollY, 'a drag on the page moves the page').toBeGreaterThan(start.scrollY);
    } finally {
      await context.close();
    }
  });
});
