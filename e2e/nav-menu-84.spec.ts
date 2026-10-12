import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 84, §G.8 and §G.2: "The open menu covers everything below the header's
 * row on opaque paper, and the page beneath it does not move."
 *
 * A supersession of the pushed menu steps 76, 78 and 79 built. The panel is
 * fixed from the header's rule to the viewport's bottom, full width; the
 * header's 53 row stays above it; the header's height does not change, so
 * the wall does not move and the page does not grow.
 *
 * **"Above the page" is asserted on the wall, not on ordinary content.** The
 * wall draws with transforms, and each makes its own stacking layer, so a
 * panel above a paragraph proves nothing about a seat. Two channels, because
 * they claim different things: a tap on the panel's paper over a seat lands
 * on the panel (it takes input), and the pixel at that point is the panel's
 * paper (it is painted on top).
 *
 * The figures for Collection at 390 by 844 -- page 981 long, the far region
 * 791 tall, seats 81.9 by 133.8 -- are the test environment's seeded
 * seventeen, measured before the menu covered. The page was 929 until step
 * 95 (7 Oct) gave the narrow rail a second row: the band went from 84.5 to
 * 126.5, which is the 42. The full gate found it here, a contract in a
 * file step 95 never opened, on its first run after the change.
 * And 971 until step 100 (9 Oct) made the band's search field 44 from 34:
 * the 10 was predicted from §T.1 before it was measured, and it measured 981.
 */

const MENU_BELOW = 584;
const SECTIONS = ['Collection', 'Want list', 'Look up', 'Stats', 'Manage'];

async function seedRecord(page: Page): Promise<string> {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `Menu84-${s}` } });
  const artistId = ((await a.json()) as { id: string }).id;
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { title: `Menu84 ${s}`, artistId } });
  expect(r.status()).toBe(201);
  return ((await r.json()) as { id: string }).id;
}

async function open(page: Page, path: string, width: number, height = 844) {
  await page.setViewportSize({ width, height });
  await page.goto(path);
  await page.locator('[data-app-nav]').waitFor({ timeout: 20_000 });
  await page.evaluate(() => document.fonts.ready);
}

const control = (page: Page) => page.locator('[data-app-nav] [data-menu-control]');
const panel = (page: Page) => page.locator('[data-menu-panel]');
const isOpen = (page: Page) => expect(control(page)).toHaveAttribute('aria-expanded', 'true');
const isClosed = async (page: Page) => {
  await expect(control(page)).toHaveAttribute('aria-expanded', 'false');
  await expect(panel(page)).toHaveCount(0);
};

/** Paper as a painted pixel, and one pixel of the page as the browser drew it. */
const paperRgb = (page: Page) =>
  page.evaluate(() => {
    const k = document.createElement('canvas'); k.width = 1; k.height = 1;
    const x = k.getContext('2d') as CanvasRenderingContext2D;
    x.fillStyle = getComputedStyle(document.body).backgroundColor; x.fillRect(0, 0, 1, 1);
    return Array.from(x.getImageData(0, 0, 1, 1).data.slice(0, 3));
  });
async function pixelAt(page: Page, x: number, y: number): Promise<number[]> {
  const shot = await page.screenshot({ clip: { x: Math.round(x), y: Math.round(y), width: 1, height: 1 } });
  const { data } = await sharp(shot).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  return [data[0], data[1], data[2]];
}
const near = (a: number[], b: number[], tol = 3) => a.every((v, i) => Math.abs(v - b[i]) <= tol);

test.beforeEach(async ({ page }) => login(page));

test.describe('§G.8: the panel covers, and nothing beneath it moves', () => {
  /*
    Step 134: "on Collection at 390 by 844: the header, the wall's region, the page's length and the seats are the
    same open as closed" stood here. At 390 the Collection is the grid now and there is no wall under the panel, so
    the test went with its subject. The want list, a record and the 240-tall window still hold the panel below.
  */

  /* Fails against the pushed menu, which had no panel: the list sat in the header and the wall showed beneath it. */
  test('the panel is opaque paper from the header’s rule to the viewport’s bottom, full width, with the 53 row above it', async ({ page }) => {
    await open(page, '/want-list', 390);
    await control(page).click();
    await isOpen(page);
    const m = await page.evaluate(() => {
      const bar = (document.querySelector('[data-app-nav] > div') as HTMLElement).getBoundingClientRect();
      const p = (document.querySelector('[data-menu-panel]') as HTMLElement);
      const r = p.getBoundingClientRect();
      const cs = getComputedStyle(p);
      const c = (document.querySelector('[data-menu-control]') as HTMLElement).getBoundingClientRect();
      return { top: r.top - bar.top, left: r.left, right: window.innerWidth - r.right, bottom: window.innerHeight - r.bottom, position: cs.position, ruleTop: cs.borderTopWidth, controlBottom: c.bottom - bar.top, text: (document.querySelector('[data-menu-control]') as HTMLElement).textContent };
    });
    expect(m.position, 'fixed').toBe('fixed');
    expect(m.top, 'from the 52 row’s bottom, its own top edge being the rule').toBeCloseTo(52, 0);
    expect(m.ruleTop, 'the header’s rule, 1px').toBe('1px');
    expect([Math.round(m.left), Math.round(m.right)], 'full width').toEqual([0, 0]);
    expect(Math.round(m.bottom), 'to the viewport’s bottom').toBe(0);
    expect(m.controlBottom, 'the control, reading CLOSE, is above the panel').toBeLessThanOrEqual(52);
    expect(m.text).toBe('Close');
    /* Opaque: where the page's heading was drawn, the pixel is now paper. */
    const paper = await paperRgb(page);
    const heading = await page.locator('main h1').first().boundingBox();
    expect(heading, 'the page has a heading under the panel').not.toBeNull();
    if (heading) {
      const px = await pixelAt(page, heading.x + 6, heading.y + heading.height / 2);
      const below = await pixelAt(page, 195, 700);
      expect(near(below, paper), `open paper low on the panel: ${below} against ${paper}`).toBe(true);
      expect(heading.y, 'and that heading has not moved from under the header').toBeLessThan(160);
      expect(px.every((v) => v > 150) , `nothing of the heading's ink shows through at its left edge: ${px}`).toBe(true);
    }
  });

  /* Fails against the pushed menu's list, which was in flow in the header with its last hairline on the header's rule. */
  test('the list sits at the panel’s top: five 44 rows in nav order, hairlines between and below the last, the current one underlined', async ({ page }) => {
    await open(page, '/want-list', 390);
    await control(page).click();
    await isOpen(page);
    const listId = await control(page).getAttribute('aria-controls');
    const m = await page.evaluate((id) => {
      const list = document.getElementById(id as string) as HTMLElement;
      const p = (document.querySelector('[data-menu-panel]') as HTMLElement).getBoundingClientRect();
      const inPanel = (document.querySelector('[data-menu-panel]') as HTMLElement).contains(list);
      const rows = Array.from(list.querySelectorAll('a')).map((a) => {
        const r = a.getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(a.firstChild as Node);
        return { text: (a.textContent ?? '').trim(), height: r.height, labelLeft: range.getBoundingClientRect().left, border: getComputedStyle(a).borderBottomWidth, current: a.getAttribute('aria-current'), mark: a.querySelector('[data-current-mark]') !== null };
      });
      return { inPanel, listTop: list.getBoundingClientRect().top - p.top, rows };
    }, listId);
    expect(m.inPanel, 'the list is in the panel').toBe(true);
    expect(m.listTop, 'directly under the panel’s rule').toBeCloseTo(1, 0);
    expect(m.rows.map((r) => r.text)).toEqual(SECTIONS);
    for (const r of m.rows) {
      expect(r.height, `${r.text}: 44`).toBe(44);
      expect(r.labelLeft, `${r.text}: label at the 18 inset`).toBeCloseTo(18, 0);
      expect(r.border, `${r.text}: a hairline below`).toBe('1px');
    }
    expect(m.rows.filter((r) => r.current === 'page').map((r) => [r.text, r.mark])).toEqual([['Want list', true]]);
  });
});

test.describe('§G.8: the panel is above the wall, asserted on the wall', () => {
  /*
    Step 134: "at 390 on Collection, a tap on the panel's paper over a seat lands on the panel" stood here. No seat
    is drawn at 390 now. The record's cover, below, is the case that ever outranked an un-raised panel.
  */
});

test.describe('§G.8: the panel is above positioned content, asserted where there is some', () => {
  /**
   * **The wall test above cannot fail on stacking, and this one can.** Below
   * 584 the wall is always the overview -- the near view, whose transforms
   * make stacking layers, needs more than 590 -- so nothing on Collection
   * outranks a fixed panel, raised or not: staged with the panel's z-index
   * removed, every wall assertion still passed. What does outrank an
   * un-raised panel is positioned content later in the page, and the record
   * page's cover is absolutely positioned. Staged the same way, this fails:
   * the cover paints over the panel and takes the tap.
   */
  /* Fails against the panel without its z-index: a tap on the cover lands on the cover, and its pixel is the photograph. */
  test('on a record with a cover at 390, a tap on the cover lands on the panel, and the pixel there is paper', async ({ page }) => {
    const id = await seedRecord(page);
    /* A solid dark cover, so "paper" at that point can only be the panel. */
    const dark = await page.evaluate(() => {
      const c = document.createElement('canvas'); c.width = 64; c.height = 64;
      const x = c.getContext('2d') as CanvasRenderingContext2D; x.fillStyle = '#281c14'; x.fillRect(0, 0, 64, 64);
      return c.toDataURL('image/png');
    });
    await seedImage({ recordId: id, imageType: 'cover', url: dark });
    await open(page, `/records/${id}`, 390);
    const cover = page.locator('[data-cell="sleeve"] img[data-cover][data-cover-treatment]');
    await cover.waitFor({ timeout: 30_000 });
    await cover.scrollIntoViewIfNeeded();
    const point = await cover.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const y = Math.min(window.innerHeight - 20, Math.max(r.top + 20, 330));
      return { x: r.left + r.width / 2, y, position: getComputedStyle(el).position, inCover: y > r.top && y < r.bottom };
    });
    /* The preconditions: the cover is positioned, the point is on it, closed it takes the tap, and it is not paper. */
    expect(point.position, 'the cover is positioned').toBe('absolute');
    expect(point.inCover, 'the point is on the cover').toBe(true);
    const scrollBefore = await page.evaluate(() => window.scrollY);
    expect(await page.evaluate((p) => document.elementFromPoint(p.x, p.y)?.hasAttribute('data-cover') ?? false, point), 'closed, a tap there lands on the cover').toBe(true);
    const paper = await paperRgb(page);
    expect(near(await pixelAt(page, point.x, point.y), paper, 20), 'closed, that pixel is the photograph, not paper').toBe(false);
    await page.evaluate(() => window.scrollTo(0, 0));
    /* The header is at the top of the page, so the menu is opened from there; the point is re-read where the cover now sits. */
    const at = await cover.evaluate((el) => { const r = el.getBoundingClientRect(); return { x: r.left + r.width / 2, y: Math.min(window.innerHeight - 20, Math.max(r.top + 20, 330)), inCover: r.bottom > 330 }; });
    expect(at.inCover, `at the top of the page the cover still reaches below the list (scrolled ${scrollBefore} before)`).toBe(true);
    await control(page).click();
    await isOpen(page);
    await page.waitForTimeout(400);
    const hit = await page.evaluate((p) => { const el = document.elementFromPoint(p.x, p.y); return { onPanel: el?.closest('[data-menu-panel]') !== null, onCover: el?.hasAttribute('data-cover') ?? false }; }, at);
    expect(hit.onPanel, 'open, a tap there lands on the panel').toBe(true);
    expect(hit.onCover, 'and not on the cover').toBe(false);
    const px = await pixelAt(page, at.x, at.y);
    expect(near(px, paper), `and the pixel is the panel's paper: ${px} against ${paper}`).toBe(true);
  });
});

test.describe('§G.8: how the covering menu closes', () => {
  /* Fails against the pushed menu, which stayed open on a click elsewhere "because it covers nothing". */
  test('a tap on the panel below the list closes it; CLOSE and Escape close it; scrolling does not', async ({ page }) => {
    await open(page, '/want-list', 390);
    await control(page).click();
    await isOpen(page);
    await page.mouse.wheel(0, 300);
    await page.waitForTimeout(200);
    await isOpen(page);
    expect(await page.evaluate(() => window.scrollY), 'and the page beneath is held where it was').toBe(0);
    await page.mouse.click(195, 700);
    await isClosed(page);
    await control(page).click();
    await isOpen(page);
    await control(page).click();
    await isClosed(page);
    await control(page).click();
    await isOpen(page);
    await page.keyboard.press('Escape');
    await isClosed(page);
    expect(await page.evaluate(() => document.activeElement?.hasAttribute('data-menu-control') ?? false), 'Escape returns focus to the control').toBe(true);
  });

  /* Fails against the pushed menu, which added no history entry: Back left the page. */
  test('opening adds one history entry at the same URL, Back closes it, and a chosen link replaces it', async ({ page }) => {
    await open(page, '/stats', 390);
    await page.goto('/want-list');
    await page.locator('[data-app-nav]').waitFor();
    const before = await page.evaluate(() => history.length);
    await control(page).click();
    await isOpen(page);
    expect(await page.evaluate(() => history.length), 'one entry added').toBe(before + 1);
    await expect(page).toHaveURL(/\/want-list$/);
    await page.goBack();
    await isClosed(page);
    await expect(page, 'Back closed the menu and stayed on the page').toHaveURL(/\/want-list$/);
    /* Closing by CLOSE removes the entry it added, so entries do not pile up. */
    await control(page).click();
    await isOpen(page);
    await control(page).click();
    await isClosed(page);
    await page.goBack();
    await expect(page, 'after a CLOSE, Back leaves the page: the menu left no entry behind').toHaveURL(/\/stats$/);
    await page.goForward();
    await expect(page).toHaveURL(/\/want-list$/);
    /* A chosen link replaces the menu's entry: Back from the new screen returns to the screen the menu was opened on, closed. */
    await control(page).click();
    await isOpen(page);
    await page.locator('[data-menu-list] a', { hasText: 'Manage' }).click();
    await expect(page).toHaveURL(/\/manage$/);
    await isClosed(page);
    await page.goBack();
    await expect(page).toHaveURL(/\/want-list$/);
    await isClosed(page);
  });

  /* Fails against the pushed menu, whose open state outlived the breakpoint and reopened on narrowing. */
  test('widening past the breakpoint closes it, and narrowing again shows it closed', async ({ page }) => {
    await open(page, '/want-list', 390);
    await control(page).click();
    await isOpen(page);
    await page.setViewportSize({ width: MENU_BELOW + 40, height: 844 });
    await expect(panel(page)).toHaveCount(0);
    await expect(page.locator('[data-app-nav] nav[aria-label="Main"] a').first()).toBeVisible();
    await page.setViewportSize({ width: 390, height: 844 });
    await isClosed(page);
  });
});

test.describe('§G.8: a record, and a short window', () => {
  /* Fails against the pushed menu, which kept the slot's row below the list and in view. */
  test('on a record at 390, the slot’s row is under the panel', async ({ page }) => {
    const id = await seedRecord(page);
    await open(page, `/records/${id}`, 390);
    const slot = await page.locator('[data-slot="actions"]').boundingBox();
    expect(slot, 'the slot has its own row').not.toBeNull();
    await control(page).click();
    await isOpen(page);
    const m = await page.evaluate(() => {
      const s = (document.querySelector('[data-slot="actions"]') as HTMLElement).getBoundingClientRect();
      const p = (document.querySelector('[data-menu-panel]') as HTMLElement).getBoundingClientRect();
      const hit = document.elementFromPoint(s.left + s.width / 2, s.top + s.height / 2);
      return { slotTop: s.top, panelTop: p.top, header: Math.round((document.querySelector('[data-app-nav]') as HTMLElement).getBoundingClientRect().height), covered: hit?.closest('[data-menu-panel]') !== null, onSlot: hit?.closest('[data-slot="actions"]') !== null };
    });
    expect(m.header, 'the header is as tall as it was closed: 53 and the slot’s 44').toBe(97);
    expect(m.slotTop, 'the slot’s row has not moved').toBeCloseTo(slot?.y ?? -1, 0);
    expect(m.slotTop, 'and lies below the panel’s top').toBeGreaterThanOrEqual(m.panelTop);
    expect(m.covered, 'a tap where the slot is lands on the panel').toBe(true);
    expect(m.onSlot, 'not on Edit or Delete record').toBe(false);
  });

  /* Fails against the pushed menu, where a short window scrolled the whole page and the header's row with it. */
  test('at 390 by 240 the list scrolls within the panel, the header’s row stays, and the panel ends at the viewport’s bottom', async ({ page }) => {
    await open(page, '/want-list', 390, 240);
    await control(page).click();
    await isOpen(page);
    const m = await page.evaluate(async () => {
      const p = document.querySelector('[data-menu-panel]') as HTMLElement;
      const scroller = (document.querySelector('[data-menu-scroll]') as HTMLElement | null) ?? p;
      const before = (document.querySelector('[data-menu-list] a:last-child') as HTMLElement).getBoundingClientRect().bottom;
      scroller.scrollTop = 1000;
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const after = (document.querySelector('[data-menu-list] a:last-child') as HTMLElement).getBoundingClientRect().bottom;
      const c = (document.querySelector('[data-menu-control]') as HTMLElement).getBoundingClientRect();
      const r = p.getBoundingClientRect();
      return { overflows: scroller.scrollHeight > scroller.clientHeight, scrolled: scroller.scrollTop, lastBefore: before, lastAfter: after, controlTop: c.top, panelBottom: r.bottom, viewport: window.innerHeight, pageScroll: window.scrollY };
    });
    expect(m.overflows, 'the list is taller than the panel').toBe(true);
    expect(m.lastBefore, 'closed to scrolling, the last row is cut off below the window').toBeGreaterThan(m.viewport);
    expect(m.scrolled, 'the list scrolled').toBeGreaterThan(0);
    expect(m.lastAfter, 'and its last row came into the window').toBeLessThanOrEqual(m.viewport + 0.5);
    expect(m.controlTop, 'the header’s row stayed where it was').toBe(4);
    expect(Math.round(m.panelBottom), 'the panel ends at the viewport’s bottom').toBe(m.viewport);
    expect(m.pageScroll, 'the page beneath did not scroll').toBe(0);
  });
});
