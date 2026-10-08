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
 * The figures for Collection at 390 by 844 -- page 971 long, the far region
 * 791 tall, seats 81.9 by 133.8 -- are the test environment's seeded
 * seventeen, measured before the menu covered. The page was 929 until step
 * 95 (7 Oct) gave the narrow rail a second row: the band went from 84.5 to
 * 126.5, which is the 42. The full gate found it here, a contract in a
 * file step 95 never opened, on its first run after the change.
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

/** What the wall and the page measure, for comparing closed with open. */
const wallState = (page: Page) =>
  page.evaluate(() => {
    const region = document.querySelector('[data-region="far"]') as HTMLElement;
    const seats = Array.from(document.querySelectorAll('[data-wall="overview"] a[data-far-seat]')).map((a) => a.getBoundingClientRect());
    const r = region.getBoundingClientRect();
    return {
      header: Math.round((document.querySelector('[data-app-nav]') as HTMLElement).getBoundingClientRect().height),
      variable: document.documentElement.style.getPropertyValue('--app-nav-height'),
      page: document.documentElement.scrollHeight,
      regionTop: Math.round(r.top * 10) / 10,
      regionHeight: Math.round(r.height),
      seats: seats.length,
      seatW: seats.length ? Math.round(seats[0].width * 10) / 10 : null,
      seatH: seats.length ? Math.round(seats[0].height * 10) / 10 : null,
      seatX: seats.length ? seats[0].left + seats[0].width / 2 : null,
      seatY: seats.length ? seats[0].top + seats[0].height / 2 : null,
    };
  });

test.beforeEach(async ({ page }) => login(page));

test.describe('§G.8: the panel covers, and nothing beneath it moves', () => {
  /* Fails against the pushed menu: the header grew to 273, the far region shrank from 791 to 571 and the seats from 81.9 x 133.8 to 53.7 x 87.7. */
  test('on Collection at 390 by 844: the header, the wall’s region, the page’s length and the seats are the same open as closed', async ({ page }) => {
    await open(page, '/', 390);
    await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    const closed = await wallState(page);
    /* The preconditions: the figures this step's ruling quotes are the ones on the page. */
    expect(closed.header, 'closed: the header is 53').toBe(53);
    expect(closed.page, 'closed: the page is 971 long').toBe(971);
    expect(closed.regionHeight, 'closed: the far region is 791 tall').toBe(791);
    /*
      The page's 971 and the region's 791 do not depend on how many records
      the wall holds; a seat's size does, because the overview fits every
      seat into the region. The test database is shared, and in a run with
      other specs the wall held more than the seeded seventeen. So the seat's
      81.9 by 133.8 is asserted when the wall is those seventeen, and the
      claim that matters -- the same open as closed -- is asserted always.
    */
    expect(closed.seats, 'closed: there are seats to compare').toBeGreaterThan(0);
    test.info().annotations.push({ type: 'wall', description: `${closed.seats} seats, each ${closed.seatW} by ${closed.seatH}` });
    if (closed.seats === 17) expect([closed.seatW, closed.seatH], 'closed, on the seeded seventeen: a seat is 81.9 by 133.8').toEqual([81.9, 133.8]);
    await control(page).click();
    await isOpen(page);
    await page.waitForTimeout(800);
    const opened = await wallState(page);
    expect(opened.header, 'the header’s height does not change').toBe(closed.header);
    expect(opened.variable, 'so the variable the wall reads does not either').toBe(closed.variable);
    expect(opened.page, 'the page does not grow').toBe(closed.page);
    expect(opened.regionTop, 'the wall’s region does not move').toBe(closed.regionTop);
    expect(opened.regionHeight, 'or resize').toBe(closed.regionHeight);
    expect([opened.seatW, opened.seatH], 'and the seats beneath the panel are the size they were').toEqual([closed.seatW, closed.seatH]);
  });

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
  /* Fails against a panel that is only later in the page: the wall's transformed layers paint and take taps over it. And against the pushed menu, where the seats stay in view. */
  test('at 390 on Collection, a tap on the panel’s paper over a seat lands on the panel, and the pixel there is paper', async ({ page }) => {
    await open(page, '/', 390);
    await page.locator('[data-wall="overview"]').waitFor({ timeout: 30_000 });
    await page.waitForTimeout(1200);
    const closed = await wallState(page);
    expect(closed.seats, 'there are seats to cover').toBeGreaterThan(0);
    /*
      Points chosen by testing them, closed. The seats overlap on the
      isometric shelf, so a seat's box is mostly its neighbours and its
      centre is not reliably painted by anything; a point counts only if a
      tap there lands on a seat. Below 300 so each is on the panel's open
      paper, beneath where the list will be.
    */
    const points = await page.evaluate(() => {
      const found: { x: number; y: number }[] = [];
      for (const a of Array.from(document.querySelectorAll('[data-wall="overview"] a[data-far-seat]'))) {
        const r = a.getBoundingClientRect();
        for (let i = 1; i < 6 && found.length < 12; i += 1) {
          const x = r.left + (r.width * i) / 6;
          const y = r.top + (r.height * i) / 6;
          if (y < 300 || y > window.innerHeight - 10 || x < 10 || x > window.innerWidth - 10) continue;
          if (document.elementFromPoint(x, y)?.closest('a[data-far-seat]')) { found.push({ x, y }); break; }
        }
      }
      return found;
    });
    expect(points.length, 'closed, there are points that land on a seat, below where the list will be').toBeGreaterThan(5);
    /*
      **The precondition, so this cannot pass about nothing.** Staged with
      the panel's z-index removed, the seat assertions below still passed:
      the seats sit in no stacking layer, so a fixed panel covers them raised
      or not. That is true only while the wall at this width is the overview
      and its seats have no positioned or transformed ancestor. If the wall
      gains a layered view below 584 -- a different default, a moved
      breakpoint -- this fails, and a person looks, instead of the test going
      on passing.
    */
    const wall = await page.evaluate(() => {
      const layered = (el: Element) => {
        const cs = getComputedStyle(el);
        return cs.position !== 'static' || cs.transform !== 'none' || cs.opacity !== '1' || cs.filter !== 'none' || cs.willChange !== 'auto' || cs.isolation === 'isolate';
      };
      const seats = Array.from(document.querySelectorAll('[data-wall="overview"] a[data-far-seat]'));
      const offenders = new Set<string>();
      for (const seat of seats) {
        for (let el: Element | null = seat; el !== null && el !== document.body; el = el.parentElement) {
          if (layered(el)) offenders.add(`${el.tagName.toLowerCase()}[${el.getAttribute('data-wall') ?? el.getAttribute('data-region') ?? el.getAttribute('data-testid') ?? ''}]`);
        }
      }
      return { overview: document.querySelectorAll('[data-wall="overview"]').length, labelled: document.querySelectorAll('[data-wall="labelled"]').length, layeredAncestors: [...offenders] };
    });
    expect(wall.overview, 'the wall at this width is the overview').toBe(1);
    expect(wall.labelled, 'and not the labelled wall, whose transforms make layers').toBe(0);
    expect(wall.layeredAncestors, 'no seat sits in a positioned or transformed layer').toEqual([]);
    /*
      The part of this page that CAN outrank an un-raised panel: positioned
      elements later in the page than the header -- the rail's rows and the
      view switcher's marks. Staged without the z-index, these take the tap.
    */
    const positioned = await page.evaluate(() => {
      const header = document.querySelector('[data-app-nav]') as HTMLElement;
      const out: { x: number; y: number; what: string }[] = [];
      for (const el of Array.from(document.body.querySelectorAll('*'))) {
        if (!(el instanceof HTMLElement) || header.contains(el)) continue;
        if (getComputedStyle(el).position === 'static') continue;
        const r = el.getBoundingClientRect();
        if (r.width < 4 || r.height < 4) continue;
        const x = r.left + r.width / 2, y = r.top + r.height / 2;
        if (y < 60 || y > window.innerHeight - 4 || x < 4 || x > window.innerWidth - 4) continue;
        const hit = document.elementFromPoint(x, y);
        if (hit !== null && (hit === el || el.contains(hit))) out.push({ x, y, what: `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}` });
      }
      return out;
    });
    expect(positioned.length, 'closed, there are positioned elements under where the panel will be that take a tap').toBeGreaterThan(0);
    const seatPixel = await pixelAt(page, points[0].x, points[0].y);
    await control(page).click();
    await isOpen(page);
    await page.waitForTimeout(600);
    const paper = await paperRgb(page);
    const hits = await page.evaluate((ps) => ps.map((p) => { const el = document.elementFromPoint(p.x, p.y); return { onPanel: el?.closest('[data-menu-panel]') !== null, onSeat: el?.closest('a[data-far-seat]') !== null }; }), points);
    for (const [i, h] of hits.entries()) {
      expect(h.onPanel, `point ${i}: a tap lands on the panel`).toBe(true);
      expect(h.onSeat, `point ${i}: and not on a seat`).toBe(false);
    }
    for (const [i, p] of points.slice(0, 6).entries()) {
      const px = await pixelAt(page, p.x, p.y);
      expect(near(px, paper), `point ${i}: the pixel is the panel's paper, ${px} against ${paper}`).toBe(true);
    }
    const overPositioned = await page.evaluate((ps) => ps.map((p) => ({ what: p.what, onPanel: document.elementFromPoint(p.x, p.y)?.closest('[data-menu-panel]') !== null })), positioned);
    for (const h of overPositioned) expect(h.onPanel, `a tap where ${h.what} is lands on the panel`).toBe(true);
    /* The control for the pixel read: closed, that point was not paper, so "paper" open is the panel and not an empty seat. */
    expect(near(seatPixel, paper), `closed, the first point was a seat's colour, not paper: ${seatPixel}`).toBe(false);
  });
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
