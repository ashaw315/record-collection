import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { near, paperRgb, pixelAt } from './pixel-read';
import { seedImage } from './seed';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 101, §T.3: the filter covers.
 *
 * "An open filter covers what lies beneath its own line on opaque paper, as
 * §G.8's menu covers what lies beneath the header's row, and the page
 * beneath does not move." A supersession of step 97b's push-down
 * (`T.3/push-down`). The mechanics are §G.8's: a tap on the panel's paper
 * off the list, Back, Escape or a chosen option closes it; opening adds one
 * history entry at the same URL; the page is held; a list longer than the
 * panel scrolls within it.
 *
 * The stacking case is step 84's, on the grid: a tap AND a pixel, because
 * one proves the panel takes input and the other that it is painted above.
 * **The grid's covers are not positioned as the record page's is.** A
 * cover there is an ordinary image; what is positioned is its cell (`li`,
 * relative) and the cell's link, whose `::after` lies over the whole cell.
 * A positioned cell later in the page outranks an un-raised panel all the
 * same, cover and all, so the case can fail; the precondition asserted is
 * the cell's position, and that closed the tap lands in the cell.
 *
 * Step 102 superseded where the panel starts (`T.3/covers-own-line`): "An
 * open filter's panel covers what lies beneath the last filter line, so all
 * four lines stay in view, and a press on another filter's line closes this
 * panel and opens that one." Two tests here read the panel as starting
 * beneath its own line and now read the last line, for the ruling and not
 * to pass a build; step 102's own claims are the last describe.
 */
type Fixture = { suffix: string; artistId: string; ids: string[] };

async function seed(page: Page, records: number): Promise<Fixture> {
  const suffix = `p101${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body;
  };
  const store = await post('/api/stores', { name: `Stall-${suffix}` });
  const artist = await post('/api/artists', { name: `Lonnie-${suffix}` });
  trackArtist(artist.id);
  const ids: string[] = [];
  for (let i = 0; i < records; i += 1) ids.push((await post('/api/records', { title: `Cover ${i} ${suffix}`, artistId: artist.id, storeId: store.id })).id);
  return { suffix, artistId: artist.id, ids };
}

/** One record carrying a genre, a label, a store and a tag, so all four lines are drawn whatever else the shared database holds. */
async function seedFourLines(page: Page): Promise<void> {
  const suffix = `p102${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body;
  };
  const genre = await post('/api/genres', { name: `Skiffle-${suffix}` });
  const label = await post('/api/labels', { name: `Pye-${suffix}` });
  const store = await post('/api/stores', { name: `Stall-${suffix}` });
  const tag = await post('/api/tags', { name: `tag-${suffix}` });
  const artist = await post('/api/artists', { name: `Lonnie-${suffix}` });
  trackArtist(artist.id);
  await post('/api/records', { title: `Four lines ${suffix}`, artistId: artist.id, labelId: label.id, storeId: store.id, genreIds: [genre.id], tagIds: [tag.id] });
}

async function open(page: Page, view: 'table' | 'grid', query: string, width: number, height = 844) {
  await page.setViewportSize({ width, height });
  await page.goto(`/?view=${view}${query}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
}

const trigger = (page: Page, key: string) => page.locator(`[data-filter="${key}"] [data-filter-trigger]`);
const panel = (page: Page) => page.locator('[data-filter-panel]');
const isOpen = (page: Page, key: string) => expect(trigger(page, key)).toHaveAttribute('aria-expanded', 'true');
const isClosed = async (page: Page) => {
  await expect(panel(page)).toHaveCount(0);
  await expect(page.locator('[data-filter-trigger][aria-expanded="true"]')).toHaveCount(0);
};

/** What must not move when a filter opens. */
const pageState = (page: Page) =>
  page.evaluate(() => {
    const top = (sel: string) => { const el = document.querySelector(sel); return el === null ? null : Math.round(el.getBoundingClientRect().top * 10) / 10; };
    return { length: document.documentElement.scrollHeight, scrollY: window.scrollY, scrollX: window.scrollX, width: document.documentElement.clientWidth, genre: top('[data-filter="genreId"] [data-filter-trigger]'), label: top('[data-filter="labelId"] [data-filter-trigger]'), content: top('main table, main [data-collection-grid]'), pager: top('main nav[aria-label="Pagination"], main [data-collection-pagination]') };
  });

test.beforeEach(async ({ page }) => login(page));

for (const view of ['table', 'grid'] as const) {
  /* Fails against the push-down: the page grew by the list's height and everything beneath the line moved down by it. */
  test(`${view} at 390: an open filter is a panel of opaque paper from beneath the last filter line to the viewport’s bottom, full width, and nothing on the page moves`, async ({ page }) => {
    await open(page, view, '', 390);
    /* Scrolled a little first, so "the scroll position does not change" has a position to keep. */
    await page.evaluate(() => window.scrollTo(0, 40));
    const closed = await pageState(page);
    expect(closed.scrollY, 'the precondition: the page is scrolled').toBe(40);
    await trigger(page, 'genreId').click();
    await isOpen(page, 'genreId');
    const openState = await pageState(page);
    expect(openState, 'open: the page’s length, its scroll position, the lines and the content are where they were').toEqual(closed);

    const m = await page.evaluate(() => {
      const p = document.querySelector('[data-filter-panel]') as HTMLElement;
      const r = p.getBoundingClientRect();
      const cs = getComputedStyle(p);
      const t = (document.querySelector('[data-filter="genreId"] [data-filter-trigger]') as HTMLElement).getBoundingClientRect();
      const first = (p.querySelector('[data-filter-option]') as HTMLElement).getBoundingClientRect();
      const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]'));
      const lastBottom = lines[lines.length - 1].getBoundingClientRect().bottom;
      const body = getComputedStyle(document.body).backgroundColor;
      return { position: cs.position, left: r.left, width: r.width, top: r.top, bottom: r.bottom, viewport: { width: window.innerWidth, height: window.innerHeight }, triggerBottom: t.bottom, lastBottom, lines: lines.length, firstTop: first.top, firstLeft: first.left, triggerLeft: t.left, background: cs.backgroundColor, body, opacity: cs.opacity, inFilter: p.closest('[data-filter]')?.getAttribute('data-filter') };
    });
    expect(m.position).toBe('fixed');
    expect(m.left, 'full width').toBe(0);
    expect(m.width).toBe(m.viewport.width);
    expect(m.lines, 'the precondition: Genre is not the last line').toBeGreaterThan(1);
    expect(m.lastBottom).toBeGreaterThan(m.triggerBottom + 40);
    expect(m.top, 'from beneath the last filter line').toBeCloseTo(m.lastBottom, 0);
    expect(m.bottom, 'to the viewport’s bottom').toBe(m.viewport.height);
    expect(m.background, 'opaque paper').toBe(m.body);
    expect(m.opacity).toBe('1');
    /* Step 106 put CLOSE in the panel's top row; until then the list started at the panel's top. */
    expect(m.firstTop, 'the list starts beneath the panel’s CLOSE row').toBeCloseTo(m.top + 44, 0);
    expect(m.firstLeft, 'under its line, at the line’s inset').toBeCloseTo(m.triggerLeft, 0);
  });
}

test.describe('§T.3: the panel is above positioned content, asserted on the grid’s cells', () => {
  /* Fails against the panel without its z-index: the cell paints over the panel, the pixel is the photograph and the tap opens the record. */
  test('on the grid at 752, over a cover beside the list: the pixel is paper, and a tap there lands on the panel, closes it and opens no record', async ({ page }) => {
    const f = await seed(page, 4);
    /* Solid dark covers, so "paper" at that point can only be the panel. */
    const dark = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = '#281c14'; x.fillRect(0, 0, 64, 64);
      return c.toDataURL('image/png');
    });
    for (const id of f.ids) await seedImage({ recordId: id, imageType: 'cover', url: dark });
    await open(page, 'grid', `&artistId=${f.artistId}`, 752);
    await page.locator('[data-collection-grid] img[data-cover-treatment]').nth(3).waitFor({ timeout: 30_000 });

    /* The last cell on the row: at 752 there are four columns, and the list is held to 443, so this cover is beside it. */
    const point = await page.evaluate(() => {
      const cells = Array.from(document.querySelectorAll<HTMLElement>('[data-collection-grid] > li'));
      const cell = cells.reduce((a, b) => (b.getBoundingClientRect().left > a.getBoundingClientRect().left ? b : a));
      const img = (cell.querySelector('img') as HTMLElement).getBoundingClientRect();
      const lines = Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]'));
      const trigger = lines[lines.length - 1].getBoundingClientRect();
      return { x: img.left + img.width / 2, y: img.top + img.height / 2, cellPosition: getComputedStyle(cell).position, imgPosition: getComputedStyle(cell.querySelector('img') as HTMLElement).position, belowLine: img.top > trigger.bottom, besideList: img.left > 20 + 443, inWindow: img.top + img.height / 2 < window.innerHeight };
    });
    /* The preconditions: the cell is positioned though the cover is not, the point is under where the panel will be and beside its list, closed it is the cell's, and it is not paper. */
    expect(point.cellPosition, 'the cell is positioned').toBe('relative');
    expect(point.imgPosition, 'and the cover itself is not').toBe('static');
    expect(point.belowLine && point.besideList && point.inWindow, 'the point is beneath the last line, beside the list, in the window').toBe(true);
    expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.closest('[data-collection-grid] > li') !== null, point), 'closed, a tap there lands in the cell').toBe(true);
    const paper = await paperRgb(page);
    expect(near(await pixelAt(page, point.x, point.y), paper, 20), 'closed, that pixel is the photograph, not paper').toBe(false);

    await trigger(page, 'storeId').click();
    await isOpen(page, 'storeId');
    const hit = await page.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y); return { onPanel: el?.closest('[data-filter-panel]') !== null, onList: el?.closest('[data-filter-list]') !== null, inCell: el?.closest('[data-collection-grid] > li') !== null }; }, point);
    expect(hit, 'open, a tap there lands on the panel’s paper, off the list and not in the cell').toEqual({ onPanel: true, onList: false, inCell: false });
    const px = await pixelAt(page, point.x, point.y);
    expect(near(px, paper), `and the pixel is the panel's paper: ${px} against ${paper}`).toBe(true);

    const url = page.url();
    await page.mouse.click(point.x, point.y);
    await isClosed(page);
    expect(page.url(), 'the tap closed the panel and opened no record').toBe(url);
  });
});

test.describe('§T.3: how the covering filter closes', () => {
  /* Fails against the in-flow list: it adds no history entry, so Back leaves the screen, and there is no paper to tap. */
  test('opening adds one history entry at the same URL; Back, Escape, a second press and a tap on the paper each close it and leave none behind', async ({ page }) => {
    await open(page, 'table', '', 900);
    const url = page.url();
    const length = () => page.evaluate(() => window.history.length);
    const start = await length();

    await trigger(page, 'labelId').click();
    await isOpen(page, 'labelId');
    expect(await length(), 'one entry added').toBe(start + 1);
    expect(page.url(), 'at the same URL').toBe(url);
    await page.goBack();
    await isClosed(page);
    expect(page.url(), 'Back closed the filter and stayed on the screen').toBe(url);

    await trigger(page, 'labelId').click();
    await isOpen(page, 'labelId');
    await page.keyboard.press('Escape');
    await isClosed(page);
    await expect(trigger(page, 'labelId')).toBeFocused();

    await trigger(page, 'labelId').click();
    await isOpen(page, 'labelId');
    await trigger(page, 'labelId').click();
    await isClosed(page);

    await trigger(page, 'labelId').click();
    await isOpen(page, 'labelId');
    /*
      Step 106: at 900 the panel is a box as tall as its list, so there is
      no paper inside it below the list, and the point this pressed until
      then (30 in from its right and its foot) is an option row. It kept
      passing on that row only because the address was read before the
      choice had landed. The paper beside CLOSE, in the top row, is the
      box's own paper off the rows.
    */
    const off = await panel(page).evaluate((p) => { const r = p.getBoundingClientRect(); const c = (p.querySelector('[data-filter-close]') as HTMLElement).getBoundingClientRect(); return { x: r.left + 30, y: r.top + 22, clear: c.left > r.left + 60 }; });
    expect(off.clear, 'the precondition: the point is paper beside CLOSE, not CLOSE').toBe(true);
    await page.mouse.click(off.x, off.y);
    await isClosed(page);
    /* Long enough for a choice to have landed, had the press been a row's. */
    await page.waitForTimeout(500);

    /* Each close went back over the entry its opening added, so they have not piled up: one more open adds exactly one again. */
    expect(page.url()).toBe(url);
    await trigger(page, 'labelId').click();
    await isOpen(page, 'labelId');
    expect(await length(), 'no entries left behind by the four closes').toBe(start + 1);
  });

  /* Fails against a choice that pushes: Back from the filtered page would reopen the list, or need two presses to leave the filter. */
  test('choosing an option closes the panel and replaces its entry, so one Back returns to the unfiltered page', async ({ page }) => {
    const f = await seed(page, 1);
    await open(page, 'table', `&artistId=${f.artistId}`, 900);
    const url = page.url();
    const start = await page.evaluate(() => window.history.length);
    await trigger(page, 'storeId').click();
    await isOpen(page, 'storeId');
    await page.locator('[data-filter="storeId"] [data-filter-option]').filter({ hasText: `Stall-${f.suffix}` }).click();
    await expect(page).toHaveURL(/storeId=/, { timeout: 15_000 });
    await isClosed(page);
    expect(await page.evaluate(() => window.history.length), 'the choice took the filter’s entry and added none').toBe(start + 1);
    await page.goBack();
    await expect(page).toHaveURL(url, { timeout: 15_000 });
    await isClosed(page);
  });
});

test.describe('§T.3: the page is held, and a long list scrolls within the panel', () => {
  /* Fails against the in-flow list, which made the page as long as its options and scrolled the page to reach them. */
  test('at 390 by 500 genre’s list is longer than the panel: the panel scrolls, the page does not, and closing releases it', async ({ page }) => {
    await open(page, 'table', '', 390, 500);
    const before = await page.evaluate(() => ({ overflow: document.documentElement.style.overflow, padding: document.documentElement.style.paddingRight, length: document.documentElement.scrollHeight }));
    await trigger(page, 'genreId').click();
    await isOpen(page, 'genreId');
    const m = await panel(page).evaluate((p) => ({ scroll: p.scrollHeight, client: p.clientHeight, overflowY: getComputedStyle(p).overflowY, bottom: p.getBoundingClientRect().bottom, root: document.documentElement.style.overflow, length: document.documentElement.scrollHeight }));
    expect(m.scroll, 'the precondition: the list is longer than the panel').toBeGreaterThan(m.client);
    expect(m.overflowY).toBe('auto');
    expect(m.bottom, 'the panel ends at the viewport’s bottom').toBe(500);
    expect(m.root, 'the page is held').toBe('hidden');
    expect(m.length, 'and is no longer for the list').toBe(before.length);

    /* The wheel over the panel moves the list and not the page. */
    const at = await panel(page).evaluate((p) => { const r = p.getBoundingClientRect(); return { x: r.left + 100, y: r.top + r.height / 2 }; });
    await page.mouse.move(at.x, at.y);
    await page.mouse.wheel(0, 120);
    await expect.poll(() => panel(page).evaluate((p) => p.scrollTop)).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.scrollY), 'the page did not scroll').toBe(0);
    const last = page.locator('[data-filter="genreId"] [data-filter-option]').last();
    await last.scrollIntoViewIfNeeded();
    await expect(last, 'the last option can be reached').toBeInViewport();

    await page.keyboard.press('Escape');
    await isClosed(page);
    expect(await page.evaluate(() => ({ overflow: document.documentElement.style.overflow, padding: document.documentElement.style.paddingRight, length: document.documentElement.scrollHeight })), 'released exactly as it was').toEqual(before);
  });
});

test.describe('§T.3, step 102: the panel is beneath the last line, and every line stays pressable', () => {
  const INK = ['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)'];
  const LABEL_INK = ['lab(35.0433 0.937879 2.8959)', 'oklch(0.44 0.008 70)'];
  const keys = (page: Page) => page.locator('[data-filter]').evaluateAll((all) => all.map((el) => el.getAttribute('data-filter') as string));
  /** For each line: what a tap at its middle reaches, and its label's colour. */
  const lines = (page: Page) =>
    page.locator('[data-filter]').evaluateAll((all) => all.map((el) => {
      const t = el.querySelector('[data-filter-trigger]') as HTMLElement;
      const r = t.getBoundingClientRect();
      const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { key: el.getAttribute('data-filter') as string, own: at !== null && t.contains(at), bottom: r.bottom, colour: getComputedStyle(el.querySelector('[data-filter-label]') as HTMLElement).color };
    }));

  /* Fails against step 101's panel, which starts beneath the open filter's own line: with Genre open the lines below it are under paper, and a tap where they sit closes the panel and opens nothing. */
  test('from each open filter, every line is in view above the panel, and a press on each other line opens that line’s list in one tap', async ({ page }) => {
    await seedFourLines(page);
    await open(page, 'table', '', 390);
    const all = await keys(page);
    expect(all, 'the precondition: all four lines').toEqual(['genreId', 'labelId', 'storeId', 'tagId']);
    const start = await page.evaluate(() => window.history.length);
    for (const from of all) {
      for (const to of all.filter((k) => k !== from)) {
        await trigger(page, from).click();
        await isOpen(page, from);
        const read = await lines(page);
        const top = await panel(page).evaluate((p) => p.getBoundingClientRect().top);
        expect(top, `${from} open: the panel starts beneath the last line`).toBeCloseTo(read[read.length - 1].bottom, 0);
        expect(read.filter((l) => !l.own).map((l) => l.key), `${from} open: lines a tap does not reach`).toEqual([]);

        await trigger(page, to).click();
        await isOpen(page, to);
        await expect(page.locator('[data-filter-trigger][aria-expanded="true"]'), `${from} then ${to}: one open`).toHaveCount(1);
        await expect(panel(page), 'and one panel').toHaveCount(1);
        await expect(page.locator(`[data-filter="${to}"] [data-filter-option]`).first(), `${to}’s list, in one tap`).toBeVisible();
        expect(await page.evaluate(() => window.history.length), 'the switch added no entry').toBe(start + 1);
        await page.keyboard.press('Escape');
        await isClosed(page);
      }
    }
  });

  /* Fails against lines whose labels are the label colour whichever is open: the panel would not say whose it is. */
  test('the open filter’s label is in ink and the others in the label colour; closed, all are the label colour', async ({ page }) => {
    await seedFourLines(page);
    await open(page, 'table', '', 390);
    const all = await keys(page);
    expect(all, 'the precondition: all four lines').toEqual(['genreId', 'labelId', 'storeId', 'tagId']);
    for (const l of await lines(page)) expect(LABEL_INK, `closed, ${l.key}: ${l.colour}`).toContain(l.colour);
    for (const key of all) {
      await trigger(page, key).click();
      await isOpen(page, key);
      for (const l of await lines(page)) expect(l.key === key ? INK : LABEL_INK, `${key} open, ${l.key}: ${l.colour}`).toContain(l.colour);
      await page.keyboard.press('Escape');
      await isClosed(page);
    }
    for (const l of await lines(page)) expect(LABEL_INK, `closed again, ${l.key}: ${l.colour}`).toContain(l.colour);
  });
});
