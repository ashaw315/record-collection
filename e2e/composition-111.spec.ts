import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { clearing } from '../src/app/figure-source';
import { login } from './sign-in';

registerCleanup();

/**
 * Steps 111 and 112, §T.6: the table's and the grid's composition.
 *
 * "On the table and the grid the heading's figure spans the filter block,
 * Sort and the four filter lines in whatever order the build sets them:
 * its top meets the block's first line's top, its foot meets the block's
 * last line's foot, and its right edge meets the content's right edge."
 * "Where the width beside the 443 column, less the 24 margin, cannot hold
 * the figure at the filter block's height, the figure narrows to that
 * width with its foot and right edge kept, and below the clearing height
 * there is no figure." "The table's header starts 24 below [the block's
 * foot] across the full width." "Above a 1440 window the table's and
 * grid's content stops growing at 1,400 wide from the 20 inset."
 *
 * Step 112: "Draw the construction at the block's height first; size the
 * three cubes to the width left beside it, up to the ink cap, with
 * half-solid gaps; where three cubes cannot each clear 6px on every face,
 * draw the construction alone." On the table only: "the grid's figure in
 * ink alone."
 *
 * A supersession of step 103d's figure in the air (`T.6`), and of step
 * 110's solids sized before the construction. **Held, and not read here:
 * the state with a year filter in force**, where two more lines follow the
 * block; which is its last line then is with Design.
 */
const WIDTHS = [1920, 1440, 1024, 768];

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
  page.evaluate(() => {
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const host = document.querySelector<HTMLElement>('[data-heading-figure]') as HTMLElement;
    const lines = [document.querySelector('[data-sort-control]') as HTMLElement, ...Array.from(document.querySelectorAll<HTMLElement>('[data-filter-trigger]'))].map((el) => ({ name: (el.textContent ?? '').trim().slice(0, 12), ...box(el) })).sort((a, b) => a.top - b.top);
    const list = document.querySelector('main [data-collection-table] table, main [data-collection-grid]') as HTMLElement;
    const still = host.querySelector<SVGSVGElement>('[data-testid="construction-still"]');
    /* A part of the drawing, in the window: a nested drawing's client box is the box of what it draws, so its placed box is read through the drawing's own transform. */
    const placed = (el: SVGSVGElement) => {
      const m = (el.ownerSVGElement as SVGSVGElement).getScreenCTM() as DOMMatrix;
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(el.getAttribute(a)));
      return { left: m.e + x * m.a, top: m.f + y * m.d, right: m.e + (x + w) * m.a, bottom: m.f + (y + h) * m.d, width: w * m.a, height: h * m.d };
    };
    const firstRowLinks = Array.from(document.querySelectorAll<HTMLElement>('main [data-collection-grid] > li')).filter((li, _, all) => Math.abs(li.getBoundingClientRect().top - all[0].getBoundingClientRect().top) < 1);
    return {
      drawn: host.getAttribute('data-drawn') === 'true', record: host.getAttribute('data-record'),
      figure: box(host), lines, list: box(list), still: still === null ? null : placed(still),
      solids: Array.from(host.querySelectorAll('[data-solid]')).map((g) => ({ record: g.getAttribute('data-solid'), ...box(g), faces: Array.from(g.querySelectorAll('polygon')).map((p) => ({ face: p.getAttribute('data-face'), fill: p.getAttribute('fill'), width: p.getBoundingClientRect().width })) })),
      header: box(document.querySelector('header[data-app-nav]') as HTMLElement),
      columns: firstRowLinks.length, windowWidth: window.innerWidth, scrollWidth: document.documentElement.scrollWidth,
      shown: Array.from(document.querySelectorAll<HTMLAnchorElement>('main [data-collection-table] tbody a[href^="/records/"]')).map((a) => (a.getAttribute('href') ?? '').replace('/records/', '')),
    };
  });

test.beforeEach(async ({ page }) => login(page));

for (const view of ['table', 'grid'] as const) {
  for (const width of WIDTHS) {
    /* Fails against step 103d's figure: as tall as the air and standing in it, with its top under the header and the list 20 below the block. */
    test(`${view} at ${width}: the block is five lines of 44 with nothing between; the figure’s foot is the last line’s foot and its right edge the content’s, to the pixel; the list starts 24 below`, async ({ page }) => {
      await open(page, view, width);
      const r = await reading(page);
      expect(r.lines.length, 'the precondition: Sort and at least two filter lines').toBeGreaterThanOrEqual(3);
      for (const [i, line] of r.lines.entries()) {
        expect(line.height, `${line.name}: 44 tall`).toBe(44);
        if (i > 0) expect(line.top - r.lines[i - 1].bottom, `no gap above ${line.name}`).toBe(0);
      }
      const first = r.lines[0];
      const last = r.lines[r.lines.length - 1];
      expect(r.list.top - last.bottom, 'the list starts 24 below the block’s foot').toBe(24);
      expect(r.scrollWidth, 'the page is no wider than the window').toBe(r.windowWidth);

      const block = last.bottom - first.top;
      const room = r.list.right - Math.max(...r.lines.map((l) => l.right)) - 24;
      const c = clearing(r.record as string);
      const height = Math.min(block, room / c.aspect);
      expect(r.drawn, `drawn where the construction is at least its clearing height: ${height} against ${c.height}`).toBe(height >= c.height);
      if (!r.drawn) return;

      expect(r.figure.bottom, 'the figure’s foot is the block’s last line’s foot').toBe(last.bottom);
      expect(r.figure.right, 'its right edge is the content’s right edge').toBe(r.list.right);
      expect(r.figure.height, 'as tall as the block, or as the width beside the column allows').toBeCloseTo(height, 0);
      if (height === block) expect(r.figure.top, 'its top is the block’s first line’s top').toBe(first.top);
      expect(r.figure.left, 'no nearer the column than 24').toBeGreaterThanOrEqual(Math.max(...r.lines.map((l) => l.right)) + 24 - 0.5);
      const still = r.still as NonNullable<typeof r.still>;
      expect(still.height, 'the construction is as tall as the figure').toBeCloseTo(r.figure.height, 0);
      expect(still.bottom).toBeCloseTo(r.figure.bottom, 0);
      if (view === 'grid') expect(r.solids, 'the grid’s figure is in ink alone').toEqual([]);
      if (r.solids.length === 0) expect(still.right, 'alone, the construction stands at the content’s edge').toBeCloseTo(r.list.right, 0);
    });
  }

  /* Fails against content as wide as the window: at 1920 the list ran to 1900. */
  test(`${view} at 1920: the content stops at 1,400 from the 20 inset, pinned left, with the header across the whole window`, async ({ page }) => {
    await open(page, view, 1920);
    const r = await reading(page);
    expect({ left: r.list.left, right: r.list.right }, 'the list').toEqual({ left: 20, right: 1420 });
    expect(r.header.width, 'the header runs the window').toBe(1920);
    if (view === 'grid') expect(r.columns, 'the grid stops at seven columns').toBe(7);
    await open(page, view, 1440);
    expect((await reading(page)).list, 'and at 1440 it is as it was').toMatchObject({ left: 20, right: 1420 });
  });

  /* "At 768 and up": fails against a figure drawn wherever it clears, which on the real collection was from 713. */
  test(`${view} at 767: no heading figure, though the same page draws one at 768 where the width holds it`, async ({ page }) => {
    await open(page, view, 767);
    expect((await reading(page)).drawn, 'at 767').toBe(false);
    expect(await page.locator('[data-heading-figure] svg').count()).toBe(0);
    await page.setViewportSize({ width: 768, height: 900 });
    await page.waitForTimeout(500);
    const r = await reading(page);
    const room = r.list.right - Math.max(...r.lines.map((l) => l.right)) - 24;
    const c = clearing(r.record as string);
    const block = r.lines[r.lines.length - 1].bottom - r.lines[0].top;
    test.skip(Math.min(block, room / c.aspect) < c.height, 'on this collection the source does not clear at 768 either, so 767 shows nothing by the fork');
    expect(r.drawn, 'at 768').toBe(true);
  });

  for (const width of [390, 320]) {
    test(`${view} at ${width}: no heading figure, and the block is still lines of 44 with nothing between`, async ({ page }) => {
      await open(page, view, width);
      const r = await reading(page);
      expect(r.drawn).toBe(false);
      expect(await page.locator('[data-heading-figure] svg').count()).toBe(0);
      for (const [i, line] of r.lines.entries()) if (i > 0) expect(line.top - r.lines[i - 1].bottom, `no gap above ${line.name}`).toBe(0);
    });
  }
}

/** Four records by one artist, in title order: the second has no colour. */
async function seed(page: Page): Promise<{ artistId: string; ids: string[] }> {
  const suffix = `c111${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body;
  };
  const artist = await post('/api/artists', { name: `Cubes-${suffix}` });
  trackArtist(artist.id);
  /*
    A genre, a label, a store and a tag on the first record, so all four
    filter lines are drawn whatever else the shared database holds: a
    filter with no options has no line, and a block of three lines (132)
    is under any clearing height. Seen on the first run of this spec.
  */
  const genre = await post('/api/genres', { name: `Skiffle-${suffix}` });
  const label = await post('/api/labels', { name: `Pye-${suffix}` });
  const store = await post('/api/stores', { name: `Stall-${suffix}` });
  const tag = await post('/api/tags', { name: `tag-${suffix}` });
  const ids: string[] = [];
  for (const [i, title] of ['A first', 'B second', 'C third', 'D fourth'].entries()) ids.push((await post('/api/records', { title: `${title} ${suffix}`, artistId: artist.id, ...(i === 0 ? { labelId: label.id, storeId: store.id, genreIds: [genre.id], tagIds: [tag.id] } : {}) })).id);
  const db = getTestDb();
  for (const [i, colour] of ['#b4442c', null, '#2c6eb4', '#3c9a4a'].entries()) if (colour !== null) await db.execute(sql`UPDATE records SET spine_colour = ${colour} WHERE id = ${ids[i]}::uuid`);
  return { artistId: artist.id, ids };
}

test.describe('§T.6, step 112: the solids give way to the construction', () => {
  for (const width of [1440, 1024]) {
    /* Fails against step 110: the solids sized first, at the ink's allowance, and the construction made smaller to hold them. */
    test(`the table at ${width}: the construction is as tall as the block, and a cube for each coloured record of the first three stands to its right, half a solid apart, every face 6 or wider, ending at the content’s edge`, async ({ page }) => {
      const f = await seed(page);
      /* The artist's filter is in the address and adds no line to the block. */
      await open(page, 'table', width, `&artistId=${f.artistId}&sort=title:asc`);
      const r = await reading(page);
      expect(r.shown.slice(0, 4), 'the precondition: the four in title order').toEqual(f.ids);
      expect(r.lines.length, 'the precondition: Sort and all four filter lines, so the block is 220').toBe(5);
      expect(clearing(r.record as string).height, 'the precondition: the source clears within the block’s height').toBeLessThanOrEqual(220);
      expect(r.drawn, 'the figure is drawn').toBe(true);
      const block = r.lines[r.lines.length - 1].bottom - r.lines[0].top;
      const still = r.still as NonNullable<typeof r.still>;
      expect(still.height, 'the construction keeps the block’s height').toBeCloseTo(block, 0);

      expect(r.solids.map((s) => s.record), 'the first three shown, less the one with no colour').toEqual([f.ids[0], f.ids[2]]);
      const [a, b] = r.solids;
      expect(a.width, 'one size').toBeCloseTo(b.width, 0);
      expect(a.left - still.right, 'half a solid from the construction').toBeCloseTo(a.width / 2, 0);
      expect(b.left - a.right, 'and from each other').toBeCloseTo(a.width / 2, 0);
      for (const solid of r.solids) {
        expect(solid.bottom, 'on the construction’s ground line').toBeCloseTo(still.bottom, 0);
        expect(solid.faces.map((x) => x.face).sort()).toEqual(['base', 'shade', 'top']);
        expect(new Set(solid.faces.map((x) => x.fill)).size, 'three steps of its own record').toBe(3);
        for (const face of solid.faces) expect(face.width, `${face.face}: no face under 6`).toBeGreaterThanOrEqual(6);
      }
      expect(a.faces.map((x) => x.fill), 'two records, two colours').not.toEqual(b.faces.map((x) => x.fill));
      /* Three places are kept: the third is empty here, and the figure's right edge is still the content's. */
      expect(r.figure.right).toBe(r.list.right);
      expect(r.figure.right - b.right, 'the empty third place: a gap and a solid').toBeCloseTo(a.width * 1.5, 0);
    });
  }

  /* "Where three cubes cannot each clear 6px on every face, draw the construction alone." At 768 the construction takes the whole width. */
  test('the table at 768: no width is left beside the construction, so it stands alone', async ({ page }) => {
    const f = await seed(page);
    await open(page, 'table', 768, `&artistId=${f.artistId}&sort=title:asc`);
    const r = await reading(page);
    if (!r.drawn) { test.info().annotations.push({ type: 'note', description: 'not drawn at 768 on this collection: the source narrows below its clearing height' }); return; }
    expect(r.solids).toEqual([]);
    expect((r.still as NonNullable<typeof r.still>).right).toBeCloseTo(r.list.right, 0);
  });
});

/*
  Carried from `heading-figure-103d.spec.ts`, which read the figure in the
  air and is superseded with it; and from `heading-solids-110.spec.ts`,
  whose claims about the row are the describe above. What those two held
  that the composition does not change is here.
*/
test.describe('§T.6: the figure is the one source record’s, in ink, and does not follow the page', () => {
  const INKS = ['lab(6.18075 1.20374 2.12039)', 'oklch(0.19 0.008 60)', 'lab(71.4 0.5 1.1)', 'oklch(0.74 0.004 80)'];
  const still = (page: Page) =>
    page.evaluate(() => {
      const host = document.querySelector<HTMLElement>('[data-heading-figure]') as HTMLElement;
      const svg = host.querySelector('[data-testid="construction-still"]');
      return {
        drawn: host.getAttribute('data-drawn') === 'true', record: host.getAttribute('data-record'), clearing: Number(host.getAttribute('data-clearing')), stillRecord: svg?.getAttribute('data-record') ?? null,
        fills: svg === null ? [] : Array.from(new Set(Array.from(svg.querySelectorAll('polygon[data-face], circle')).map((el) => getComputedStyle(el).fill))),
        position: getComputedStyle(host).position, pointer: getComputedStyle(host).pointerEvents, hidden: host.getAttribute('aria-hidden'), top: host.getBoundingClientRect().top, height: host.getBoundingClientRect().height,
        shown: Array.from(document.querySelectorAll<HTMLAnchorElement>('main [data-collection-table] tbody a[href^="/records/"], main [data-collection-grid] a[href^="/records/"]')).map((a) => (a.getAttribute('href') ?? '').replace('/records/', '')),
      };
    });

  /* Fails against a source taken from the page's first record, which a re-sort changes, and against a construction drawn in a record's colour. */
  test('under three sorts and on both views, the construction named is the one drawn, in ink alone, and clears no higher than any record shown', async ({ page }) => {
    for (const [view, query] of [['table', ''], ['table', '&sort=title:desc'], ['table', '&sort=releaseYear:desc'], ['grid', '&sort=title:asc']] as const) {
      await open(page, view, 1440, query);
      const f = await still(page);
      expect(f.clearing, `${view}${query}: its clearing height is its construction’s`).toBeCloseTo(clearing(f.record as string).height, 3);
      expect(f.shown.length, 'the precondition: the page shows records').toBeGreaterThan(3);
      for (const id of f.shown) expect(f.clearing, `${view}${query}: no record shown clears lower, ${id}`).toBeLessThanOrEqual(clearing(id).height + 1e-6);
      expect({ position: f.position, pointer: f.pointer, hidden: f.hidden }, 'out of the flow, taking no press, and not read out').toEqual({ position: 'absolute', pointer: 'none', hidden: 'true' });
      if (!f.drawn) continue;
      expect(f.stillRecord, 'the construction drawn is the named record’s').toBe(f.record);
      for (const fill of f.fills) expect(INKS, `in ink alone: ${fill}`).toContain(fill);
    }
  });

  /* The figure is placed against the page, so it goes with it: fails against a figure fixed to the window. */
  test('scrolled, the figure goes with the page', async ({ page }) => {
    await open(page, 'table', 1440);
    const at = await still(page);
    await page.evaluate(() => window.scrollTo(0, 200));
    await page.waitForTimeout(400);
    const after = await still(page);
    expect(after.top, 'up with the page by 200').toBeCloseTo(at.top - 200, 0);
    expect(after.height).toBeCloseTo(at.height, 0);
  });
});

