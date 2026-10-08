import { expect, test, type Page } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { registerCleanup, trackArtist } from './cleanup';
import { GRID_FORK, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { CELL_PADDING } from '../src/app/records/[id]/extended-grid';
import { FIGURES, SIZE_RATIO, figureBox, smallestFaceRatio } from '../src/app/records/[id]/ornament';
import { freeHeightSolid } from '../src/app/records/[id]/rules-33';
import { WIDTHS, readFigures, type FigureReading } from './figure-reading';
import { login } from './sign-in';

registerCleanup();

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path}`).toBe(201);
  return response.json();
}

/**
 * §57 (step 67): "§34's rule that no mark paints over type is enforced in
 * the figure as well as the plane, so a figure is tested against its host's
 * text whatever its host... The Price history solo is sized to the strip's
 * free height below its entries, as the matrix solid is sized to its cell's,
 * and is drawn only where that free height clears §29's bound."
 *
 * §58 (step 68) moves the solo's host: "the strip's summary column at every
 * width, sized to that column's free height below its text by §57's rule."
 * The rule carries §33's width yield -- the height gives way where the
 * figure's width would cross the column's insets (§21) -- and both terms
 * are reported with which one binds.
 *
 * The sweep that produced the ruling: the solo at 0.855 of a section whose
 * height follows its content covered text on 8 real records at 390 and 15
 * from 480 to 1440, by up to 158px. Two seeded records bracket the
 * collection: nine prices (the most any real record carries) and none.
 */
/**
 * A record with a ladder, so figures render; a pressing, so the Pressing
 * detail row and the air column beside it (the pair's host) have height; and
 * `prices` observations in its history.
 */
async function seedPriced(page: Page, prices: number[]): Promise<string> {
  const suffix = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await post(page, '/api/artists', { name: `Figures ${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', { catalogNumber: `FIG-${suffix}`, matrixRunout: 'FIG-A1 STERLING', yearPressed: 2024, countryPressed: 'UK', pressingPlant: 'GZ Media', colorVariant: 'Black' });
  const record = await post(page, '/api/records', { title: `Nine Prices ${suffix}`, artistId: artist.id, pressingId: pressing.id, releaseYear: 2024, notes: 'Bought on the Saturday.' });
  const id = record.id as string;
  const db = getTestDb();
  await db.execute(sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${id}::uuid`);
  for (const price of prices) {
    await db.execute(sql`INSERT INTO price_history (record_id, price, price_type, source) VALUES (${id}::uuid, ${price}, 'used', 'discogs')`);
  }
  return id;
}

const SOLO = FIGURES['price-history:column'];
if (SOLO === undefined || SOLO.kind !== 'solo') throw new Error('§58 places a solo in the Price history summary column');
const SOLO_BOX = figureBox(SOLO);
const ASPECT = SOLO_BOX.width / SOLO_BOX.height;

/**
 * What §58 says the solo should be, from the measured column: §57's rule
 * (0.855 of the free height below the column's text) with §33's width
 * yield, since a figure never crosses its cell's side edges (§21). Both
 * terms are returned so the report can say which binds.
 */
function expectedSolo(m: FigureReading) {
  const free = Math.max(0, m.hostHeight - CELL_PADDING - m.textBottom);
  const heightTerm = free * SIZE_RATIO;
  const widthTerm = m.columnWidth / ASPECT;
  const fit = freeHeightSolid({ cellHeight: m.hostHeight, textBottom: m.textBottom, cellWidth: m.columnWidth, inset: CELL_PADDING, aspect: ASPECT, smallestFaceRatio: smallestFaceRatio(SOLO) });
  return { ...fit, free, heightTerm, widthTerm, binds: heightTerm * ASPECT > m.columnWidth ? 'width' : 'height' };
}

for (const [label, prices] of [['nine prices', [8, 9.5, 11, 12.99, 13.42, 13.63, 15, 18, 22]], ['no prices', []]] as const) {
  test(`§58: with ${label} the Price history solo sits in the summary column, sized to its free height below the column’s text with §21’s width yield, or is not drawn, and no figure covers type, at five widths`, async ({ page }) => {
    test.setTimeout(240_000);
    await login(page);
    const id = await seedPriced(page, [...prices]);
    const bad: string[] = [];
    const lines: string[] = [];
    for (const [w, h] of WIDTHS) {
      await page.setViewportSize({ width: w, height: h });
      await page.goto(`/records/${id}`);
      const figures = await readFigures(page);
      const solo = figures.find((f) => f.host === 'price-history');
      if (solo === undefined) { bad.push(`${w}: no solo rendered in Price history`); continue; }
      if (solo.cell !== 'content-0') bad.push(`${w}: the solo is hosted by ${solo.cell}, not the summary column (§58)`);
      const want = expectedSolo(solo);
      const terms = `column ${Math.round(solo.columnWidth)} inside its insets, ${Math.round(want.free)} free below its text; height term ${Math.round(want.heightTerm)} tall (${Math.round(want.heightTerm * ASPECT)} wide), width term ${Math.round(want.widthTerm)} tall (${Math.round(solo.columnWidth)} wide); ${want.binds} binds`;
      /* The component reports its own terms; they must be the ones this spec computes from the same DOM, or the report is of a different thing. */
      if (solo.terms.binds !== null && solo.terms.binds !== want.binds) bad.push(`${w}: the figure says ${solo.terms.binds} binds, the measure says ${want.binds}`);
      if (solo.terms.free !== null && Math.abs(solo.terms.free - want.free) > 1) bad.push(`${w}: the figure reports ${solo.terms.free} free, the measure ${want.free.toFixed(1)}`);
      if (want.drawn) {
        lines.push(`  §58 SOLO ${label} @${w}: drawn ${Math.round(solo.width)}×${Math.round(solo.height)} -- ${terms}`);
        if (solo.state !== 'drawn' || !solo.shown) bad.push(`${w}: the solo should draw (${Math.round(want.height)} tall) and is ${solo.state}`);
        else {
          if (Math.abs(solo.height - want.height) > 1) bad.push(`${w}: the solo is ${solo.height.toFixed(1)} tall, §58 gives ${want.height.toFixed(1)} (${want.binds} binds)`);
          if (Math.abs(solo.bottom - (solo.hostBottom - CELL_PADDING)) > 1) bad.push(`${w}: the solo's bottom is ${(solo.hostBottom - solo.bottom).toFixed(1)} above the column's foot, not on the ${CELL_PADDING}px inset`);
          if (Math.abs(solo.right - (solo.hostRight - CELL_PADDING)) > 1) bad.push(`${w}: the solo's right edge is ${(solo.hostRight - solo.right).toFixed(1)} in from the column's edge, not the ${CELL_PADDING}px inset`);
          if (solo.top < solo.hostTop + solo.textBottom - 0.5) bad.push(`${w}: the solo's top (${(solo.top - solo.hostTop).toFixed(1)}) is above the column's text (${solo.textBottom.toFixed(1)})`);
          if (solo.cutEdges !== 0) bad.push(`${w}: the solo is cut by ${solo.cutEdges} edge(s) of its column; §21 says a figure never crosses its cell's side edges`);
          if (solo.left < solo.hostLeft + CELL_PADDING - 1) bad.push(`${w}: the solo crosses the column's left inset (${(solo.left - solo.hostLeft).toFixed(1)} in)`);
        }
      } else {
        lines.push(`  §58 SOLO ${label} @${w}: not drawn -- ${terms}; a face under §29's 6px`);
        if (solo.state !== 'below-bound' || solo.shown) bad.push(`${w}: ${Math.round(want.free)} free fails §29's bound, so the solo should be below-bound and not shown; it is ${solo.state}${solo.shown ? ', shown' : ''}`);
      }
      for (const f of figures) {
        if (f.covered.length > 0) bad.push(`${w}: the ${f.kind} in ${f.host} covers type: ${f.covered.map((t) => `"${t}"`).join(', ')}`);
        if (f.shown && f.state !== 'drawn') bad.push(`${w}: the ${f.kind} in ${f.host} is shown while ${f.state}`);
      }
    }
    for (const line of lines) console.log(line);
    expect(bad, `§57 not met:\n  ${bad.join('\n  ')}`).toEqual([]);
  });
}

test('§57: a figure that would cover type in its host is not drawn, staged on the pair with text placed in its air column', async ({ page }) => {
  /*
    The air column carries no text by placement, which is why the pair was
    safe without the test; §57 rules the test in so "type placed in the air
    column by a later section" is caught. Staged: a paragraph is put in the
    air column over the pair's box, and the host is resized so the component
    re-tests, the same channel a real change in the layout would use.
  */
  test.setTimeout(120_000);
  await login(page);
  const id = await seedPriced(page, [12.99]);
  await page.setViewportSize({ width: GRID_FORK, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  const before = (await readFigures(page)).find((f) => f.kind === 'pair');
  expect(before?.state, 'the pair draws in its empty air column').toBe('drawn');
  expect(before?.shown).toBe(true);

  await page.evaluate(() => {
    const pair = document.querySelector('[data-region="extended-grid"] [data-figure="pair"]');
    const air = pair?.parentElement ?? null;
    if (air === null) throw new Error('no pair');
    const p = document.createElement('p');
    p.setAttribute('data-staged', 'type-in-air');
    p.textContent = 'Type a later section placed in the air column, run long enough to reach the figure where it is centred.';
    p.style.cssText = 'position:absolute;left:0;right:0;bottom:0;margin:0;padding:8px';
    air.appendChild(p);
  });
  /* The host grows by two pixels, which is the channel a later section's content would use; the figure re-tests on its host's resize. */
  await page.evaluate(() => { const air = document.querySelector<HTMLElement>('[data-region="extended-grid"] [data-figure="pair"]')?.parentElement ?? null; if (air === null) throw new Error('no pair'); air.style.minHeight = `${air.getBoundingClientRect().height + 2}px`; });
  await page.waitForFunction(`document.querySelector('[data-region="extended-grid"] [data-figure="pair"]')?.getAttribute('data-figure-state') === 'covers-type'`, undefined, { timeout: 10_000 });
  const during = (await readFigures(page)).find((f) => f.kind === 'pair');
  expect(during?.shown, 'a figure covering type is not drawn (§34, §57)').toBe(false);
  expect(during?.covered, 'and so covers nothing').toEqual([]);

  await page.evaluate(() => { document.querySelector('[data-staged="type-in-air"]')?.remove(); const air = document.querySelector<HTMLElement>('[data-region="extended-grid"] [data-figure="pair"]')?.parentElement ?? null; if (air !== null) air.style.minHeight = ''; });
  await page.waitForFunction(`document.querySelector('[data-region="extended-grid"] [data-figure="pair"]')?.getAttribute('data-figure-state') === 'drawn'`, undefined, { timeout: 10_000 });
  const after = (await readFigures(page)).find((f) => f.kind === 'pair');
  expect(after?.shown, 'with the type gone the pair is drawn again').toBe(true);
});
