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
  test(`${view} at 390: an open filter is a panel of opaque paper from beneath its line to the viewport’s bottom, full width, and nothing on the page moves`, async ({ page }) => {
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
      const body = getComputedStyle(document.body).backgroundColor;
      return { position: cs.position, left: r.left, width: r.width, top: r.top, bottom: r.bottom, viewport: { width: window.innerWidth, height: window.innerHeight }, triggerBottom: t.bottom, firstTop: first.top, firstLeft: first.left, triggerLeft: t.left, background: cs.backgroundColor, body, opacity: cs.opacity, inFilter: p.closest('[data-filter]')?.getAttribute('data-filter') };
    });
    expect(m.position).toBe('fixed');
    expect(m.left, 'full width').toBe(0);
    expect(m.width).toBe(m.viewport.width);
    expect(m.top, 'from beneath its own line').toBeCloseTo(m.triggerBottom, 0);
    expect(m.bottom, 'to the viewport’s bottom').toBe(m.viewport.height);
    expect(m.background, 'opaque paper').toBe(m.body);
    expect(m.opacity).toBe('1');
    expect(m.firstTop, 'the list starts at the panel’s top').toBeCloseTo(m.top, 0);
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
      const trigger = (document.querySelector('[data-filter="storeId"] [data-filter-trigger]') as HTMLElement).getBoundingClientRect();
      return { x: img.left + img.width / 2, y: img.top + img.height / 2, cellPosition: getComputedStyle(cell).position, imgPosition: getComputedStyle(cell.querySelector('img') as HTMLElement).position, belowLine: img.top > trigger.bottom, besideList: img.left > 20 + 443, inWindow: img.top + img.height / 2 < window.innerHeight };
    });
    /* The preconditions: the cell is positioned though the cover is not, the point is under where the panel will be and beside its list, closed it is the cell's, and it is not paper. */
    expect(point.cellPosition, 'the cell is positioned').toBe('relative');
    expect(point.imgPosition, 'and the cover itself is not').toBe('static');
    expect(point.belowLine && point.besideList && point.inWindow, 'the point is beneath the line, beside the list, in the window').toBe(true);
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
    const off = await panel(page).evaluate((p) => { const r = p.getBoundingClientRect(); return { x: r.right - 30, y: r.bottom - 30 }; });
    await page.mouse.click(off.x, off.y);
    await isClosed(page);

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
