import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { clearing } from '../src/app/figure-source';
import { login } from './sign-in';

registerCleanup();

/**
 * Step 110, §T.6: the solids beside the heading's construction.
 *
 * "Draw up to three of §26's isometric boxes, each faced in its record's
 * tint, top, base and shade, from the first three records the screen
 * shows. Stand them in one row on the construction's ground line, to its
 * right, one size, half a solid's width apart..., together covering no
 * more than the construction's ink, and apply the air test to the
 * construction and the row together." "A record without colour gives no
 * solid." "The empty state carries no solids."
 *
 * The geometry is `figure-solids.test.ts`'s. This reads the page: which
 * records the solids are drawn for, in what colours, and that the row is
 * inside the air with the construction.
 */
type Fixture = { artistId: string; ids: string[] };

/** Three records by one artist, sorted by title so their order on the page is known: two with a colour, the middle one without. */
async function seed(page: Page): Promise<Fixture> {
  const suffix = `s110${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    const body = (await response.json()) as { id: string };
    trackCreated(path, body);
    return body;
  };
  const artist = await post('/api/artists', { name: `Solids-${suffix}` });
  trackArtist(artist.id);
  const ids: string[] = [];
  for (const title of ['A first', 'B second', 'C third', 'D fourth']) ids.push((await post('/api/records', { title: `${title} ${suffix}`, artistId: artist.id })).id);
  return { artistId: artist.id, ids };
}

async function open(page: Page, width: number, query: string) {
  await page.setViewportSize({ width, height: 900 });
  await page.goto(`/?view=table${query}`);
  await page.locator('[data-collection-filters][data-hydrated="true"]').waitFor({ timeout: 30_000 });
  await page.addStyleTag({ content: 'nextjs-portal{display:none!important}' });
  await page.evaluate(() => document.fonts.ready);
  await page.locator('[data-heading-figure][data-measured="true"]').waitFor({ state: 'attached', timeout: 15_000 });
}

const reading = (page: Page) =>
  page.evaluate(() => {
    const host = document.querySelector<HTMLElement>('[data-heading-figure]');
    const box = (el: Element) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height }; };
    const still = host?.querySelector<SVGSVGElement>('[data-testid="construction-still"]') ?? null;
    /*
      The still's own box, by the drawing's transform: a nested drawing's
      client box is the box of what it draws, which is a little inside the
      box it is placed in.
    */
    const placed = (el: SVGSVGElement) => {
      const outer = el.ownerSVGElement as SVGSVGElement;
      const m = outer.getScreenCTM() as DOMMatrix;
      const [x, y, w, h] = ['x', 'y', 'width', 'height'].map((a) => Number(el.getAttribute(a)));
      return { left: m.e + x * m.a, top: m.f + y * m.d, right: m.e + (x + w) * m.a, bottom: m.f + (y + h) * m.d, width: w * m.a, height: h * m.d };
    };
    return {
      drawn: host?.getAttribute('data-drawn') === 'true',
      airFigure: Number(host?.getAttribute('data-air-figure') ?? NaN), clearing: Number(host?.getAttribute('data-clearing') ?? NaN), record: host?.getAttribute('data-record') ?? null,
      air: host === null || host === undefined ? null : box(host),
      still: still === null ? null : placed(still),
      solids: Array.from(host?.querySelectorAll('[data-solid]') ?? []).map((g) => ({ record: g.getAttribute('data-solid'), ...box(g), fills: Array.from(g.querySelectorAll('polygon')).map((p) => `${p.getAttribute('data-face')}:${p.getAttribute('fill')}`) })),
      shown: Array.from(document.querySelectorAll<HTMLAnchorElement>('main [data-collection-table] tbody a[href^="/records/"]')).map((a) => (a.getAttribute('href') ?? '').replace('/records/', '')),
    };
  });

test.beforeEach(async ({ page }) => login(page));

/* Fails against step 103d's figure: a construction alone. */
test('at 1920, a solid for each of the first three records shown that has a colour, in the page’s order, each in its own record’s three steps', async ({ page }) => {
  const f = await seed(page);
  /* A colour is stored from a cover when one is uploaded and no route sets it alone, so it is written here as `figures-type-57` writes it. */
  const colours = ['#b4442c', null, '#2c6eb4', '#3c9a4a'];
  const db = getTestDb();
  for (const [i, id] of f.ids.entries()) {
    if (colours[i] !== null) await db.execute(sql`UPDATE records SET spine_colour = ${colours[i]} WHERE id = ${id}::uuid`);
  }
  await open(page, 1920, `&artistId=${f.artistId}&sort=title:asc`);
  const r = await reading(page);
  expect(r.shown.slice(0, 4), 'the precondition: the page shows the four in title order').toEqual(f.ids);
  expect(r.drawn, 'the figure is drawn').toBe(true);

  /* The first three shown are A, B and C; B has no colour, so two solids, A's then C's, and none for D. */
  expect(r.solids.map((s) => s.record), 'the first three shown, less the one with no colour').toEqual([f.ids[0], f.ids[2]]);
  for (const solid of r.solids) {
    const faces = solid.fills.map((x) => x.split(':')[0]).sort();
    expect(faces, 'three faces').toEqual(['base', 'shade', 'top']);
    expect(new Set(solid.fills.map((x) => x.split(':')[1])).size, 'in three steps').toBe(3);
  }
  expect(r.solids[0].fills, 'two records, two colours').not.toEqual(r.solids[1].fills);

  const still = r.still as NonNullable<typeof r.still>;
  const air = r.air as NonNullable<typeof r.air>;
  const [first, second] = r.solids;
  expect(first.left, 'to the construction’s right').toBeGreaterThan(still.right);
  expect(first.width, 'one size').toBeCloseTo(second.width, 0);
  expect(first.left - still.right, 'half a solid’s width from the construction').toBeCloseTo(first.width / 2, 0);
  expect(second.left - first.right, 'and from each other').toBeCloseTo(first.width / 2, 0);
  for (const solid of r.solids) {
    expect(solid.bottom, 'on the construction’s ground line').toBeCloseTo(still.bottom, 0);
    expect(solid.right, 'inside the air').toBeLessThanOrEqual(air.right + 0.5);
    expect(solid.top, 'inside the air').toBeGreaterThanOrEqual(air.top - 0.5);
  }
  expect(still.height, 'the construction still clears §29').toBeGreaterThanOrEqual(clearing(r.record as string).height - 0.5);
});

/* "Apply the air test to the construction and the row together": fails against a figure tested by its construction's box alone, which would be drawn in air the row does not fit. */
test('the figure is drawn exactly where the construction and the row together reach the clearing height, at every width read', async ({ page }) => {
  let drawn = 0;
  let not = 0;
  for (const width of [1920, 1440, 1024, 768]) {
    await open(page, width, '');
    const r = await reading(page);
    expect(Number.isFinite(r.airFigure), `${width}: the air says the height the whole figure has in it`).toBe(true);
    expect(r.drawn, `${width}: ${r.airFigure} against ${r.clearing}`).toBe(r.airFigure >= r.clearing);
    if (r.drawn) {
      drawn += 1;
      expect((r.still as NonNullable<typeof r.still>).height, `${width}: the construction is as tall as the figure`).toBeCloseTo(r.airFigure, 0);
    } else {
      not += 1;
      expect(r.still, `${width}: nothing is drawn`).toBeNull();
      expect(r.solids).toEqual([]);
    }
  }
  expect(drawn, 'the precondition: it is drawn at some width').toBeGreaterThan(0);
  test.info().annotations.push({ type: 'drawn at', description: `${drawn} of 4 widths, not at ${not}` });
});

/* "The empty state carries no solids." Passes before the solids exist; here so they are not spread to it. */
test('the empty state’s figure has no solids', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?view=table&q=zzzzqqqq-nothing-matches-this');
  await expect(page.locator('[data-collection-empty] [data-testid="construction-still"]')).toHaveCount(1);
  await expect(page.locator('[data-solid]')).toHaveCount(0);
});
