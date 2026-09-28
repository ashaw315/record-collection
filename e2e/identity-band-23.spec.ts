import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { BANDS, GRID_FORK, IDENTITY_SPANS, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { bandHeightAt, upperSpansAt } from '../src/app/records/[id]/region-rows';
import { COVER_CELL } from '../src/app/records/[id]/cover-geometry';
import { STRIP_SPLIT, coverSquare, leftoverStrip } from '../src/app/records/[id]/cover-33';
import { construction } from '../src/app/records/[id]/construction';
import { ownFitViewBox } from '../src/app/records/[id]/own-fit';
import { WORST } from '../src/app/records/[id]/identity-extremes';
import { seedExtreme } from './identity-extremes';

registerCleanup();

/**
 * **§23: the upper band is 4 / 4 / 4, and the cover cell's geometry is ruled.**
 *
 * The construction was failing §5.5's floor in a cell the drawing does not
 * have. §2.1 snapped the upper dividers from 451 and 888 to 480 and 840, which
 * took the construction cell from a drawn 437 to 360 — 18% narrower — and
 * named the identity cell's gain and the figures cell's loss but not the
 * construction's. Then the band grew to 547 when the tail moved in. 0.97 in
 * the drawing became 0.658 in the build, and five rulings tried to make the
 * drawing fit a cell the file had introduced one section earlier.
 *
 * So the construction takes the fourth column from the cover: identity 480,
 * construction 480, cover 480. The identity cell cannot give it — its 412
 * measure needs the 480 — and the cover's geometry is ruled rather than left
 * to the span: 26 padding, 414 cover, 10 gap, 30 column = 480. The sleeve bar
 * and the black block SHARE that column at the cell's right edge, bar above
 * and block below, as the supplied render draws them. The file had drawn them
 * side by side, which needed 58px beside the cover that a 480 cell lacks.
 *
 * Every figure here is imported from `cover-geometry.ts` rather than typed, so
 * the test and the drawing cannot disagree about a number.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seed(page: Page) {
  const s = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  const a = await page.request.post('/api/artists', { data: { name: `band23-${s}` } });
  const { id: artistId } = await a.json();
  trackArtist(artistId);
  const r = await page.request.post('/api/records', { data: { artistId, title: `Band ${s}`, releaseYear: 1970 } });
  const { id } = await r.json();
  return id as string;
}

test('§23: the upper band is 4 / 4 / 4 at the fork', async ({ page }) => {
  await login(page);
  const id = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });
  await page.goto(`/records/${id}`);
  await page.waitForTimeout(600);

  expect([...IDENTITY_SPANS], 'the spans themselves').toEqual([4, 4, 4]);

  const cells = await page.evaluate(() =>
    ['identity', 'still', 'sleeve'].map((name) => {
      const r = document.querySelector(`[data-band="identity"] > [data-cell="${name}"]`)!.getBoundingClientRect();
      return { name, w: Math.round(r.width), h: Math.round(r.height) };
    }),
  );
  for (const cell of cells) {
    expect(cell.w, `${cell.name} is four columns`).toBe(GRID_FORK / 3);
    expect(cell.h, `${cell.name} fills the band`).toBeGreaterThanOrEqual(BANDS.identity - 1);
  }
});

/**
 * **§23's column is withdrawn by §33, and this test followed the ruling.**
 *
 * It asserted the 26 + 414 + 10 + 30 closure: a 414 cover inset 26 from the
 * top and left, with the bar and the black block stacked in a 30px column at
 * the cell's right edge. §33 reads Adam's capture as the cover "inset from
 * its cell" and rules: "The cover is the largest square its cell holds, flush
 * to the cell's top, left and right, and never cropped. At 1440 the cell is
 * 480 × 547, so the cover is 480 × 480 and a 67px strip remains beneath it.
 * The column that sat beside the cover rotates into that strip: the base bar
 * and the black block keep their order and proportions, now horizontal."
 *
 * The claims survive -- the two marks stay together, bar first, and the block
 * still reaches the band's foot -- and the geometry is read from `cover-33`
 * rather than retyped, so the test cannot drift from the page.
 */
test('§33: the cover is the cell’s largest square, and the column lies down beneath it', async ({ page }) => {
  await login(page);
  const id = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });
  await page.goto(`/records/${id}`);
  await page.waitForTimeout(600);

  expect(COVER_CELL, 'the cell is four columns').toBe(GRID_FORK / 3);

  const m = await page.evaluate(() => {
    const cellBox = document.querySelector('[data-band="identity"] > [data-cell="sleeve"]')!.getBoundingClientRect();
    const rel = (el: Element | null) => {
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left - cellBox.left), t: Math.round(r.top - cellBox.top), r: Math.round(cellBox.right - r.right), b: Math.round(r.bottom - cellBox.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    return {
      cellH: Math.round(cellBox.height),
      cover: rel(document.querySelector('[data-mark="coverFrame"], [data-cover]')),
      bar: rel(document.querySelector('[data-mark="sleeveBar"]')),
      block: rel(document.querySelector('[data-mark="sleeveBlock"]')),
    };
  });

  expect(m.cover, 'the cover (or its §5.3 frame) is drawn').not.toBeNull();
  /*
    §40 (step 45): every upper cell takes the band's height, so at this
    1000-high window the cell is the band's 607, not the 546 of the 1440 × 900
    reference, and the strip beneath the 480 square is what the cell leaves.
    The cell's height is read off the page and the model computed from it.
  */
  const cell = { width: COVER_CELL, height: m.cellH };
  const square = coverSquare(cell);
  const strip = leftoverStrip(cell);
  expect(m.cellH, 'the cell takes the band’s height at 1000 high (§40)').toBe(Math.round(bandHeightAt(1000)) - 1);
  expect(square.size, '480 × 480 in a 480-wide cell').toBe(480);
  expect(strip.orientation, 'the leftover falls beneath').toBe('horizontal');
  expect(m.cover!.w, 'cover width').toBe(square.size);
  expect(m.cover!.h, 'cover height — a square').toBe(square.size);
  expect(m.cover!.l, 'flush to the cell’s left').toBe(0);
  expect(m.cover!.t, 'flush to the cell’s top').toBe(0);
  expect(m.cover!.r, 'flush to the cell’s right').toBe(0);

  /* The strip: bar first, then block, side by side beneath the square. */
  const barW = Math.round(strip.width * STRIP_SPLIT.bar);
  expect(m.bar!.t, 'the bar starts at the square’s foot').toBe(square.size);
  expect(m.block!.t, 'the block starts there too').toBe(square.size);
  expect(m.bar!.l, 'the bar leads, from the cell’s left').toBe(0);
  expect(m.bar!.w, 'the bar takes §23’s share of the strip, now as width').toBe(barW);
  expect(m.block!.l, 'the block follows the bar').toBe(barW);
  expect(m.block!.r, 'the block reaches the cell’s right edge').toBe(0);
  expect(m.bar!.w + m.block!.w, 'together they fill the strip’s width').toBe(strip.width);
  expect(m.bar!.h, 'the bar is the strip’s height').toBe(strip.height);
  expect(m.block!.h, 'so is the block').toBe(strip.height);

  expect(m.block!.b, 'the block reaches the band’s foot, as the column did').toBe(m.cellH);
});

/**
 * **§31 and §32 are withdrawn by §33, and this test followed the ruling.**
 *
 * It asserted that the page draws §31's stated constant `-140 -186 296 314`
 * and that the frame fills 92% of the inner box, 84% of the cell -- §32's
 * arithmetic against the constant. §33 retires both: "Each record's drawing
 * is scaled to the smaller of its inner box's width and height over its own
 * forms and disc." So the viewBox the page draws is compared with the
 * generator's own-fit box for THIS record, computed beside it, and the fit is
 * asserted as binding on one axis -- which is what fitting means.
 *
 * The inner box's 432 × 498 stands: §33 changes the drawing, not the cell.
 */
test('§33: the drawing fits its OWN box, binding on one axis', async ({ page }) => {
  await login(page);
  const id = await seedExtreme(page, WORST);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });
  await page.goto(`/records/${id}`);
  await page.locator('[data-testid="construction-still"]').waitFor({ timeout: 20_000 });

  const drawn = await page.evaluate(() => {
    const cell = document.querySelector('[data-cell="still"]')!;
    const svg = document.querySelector('[data-testid="construction-still"]')!;
    const style = getComputedStyle(cell);
    const box = cell.getBoundingClientRect();
    return {
      innerHeight: box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      innerWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      viewBox: svg.getAttribute('viewBox'),
      svgHeight: svg.getBoundingClientRect().height,
      svgWidth: svg.getBoundingClientRect().width,
    };
  });

  /* The box the page drew is the generator's own-fit box for this id, computed here rather than retyped. */
  expect(drawn.viewBox, 'the page draws this record’s own box').toBe(ownFitViewBox(construction(id)));
  const [, , boxW, boxH] = (drawn.viewBox ?? '0 0 1 1').split(' ').map(Number);

  expect(Math.round(drawn.innerWidth), 'the cell’s inner box after §26’s 24px margin').toBe(432);
  /* §30: the band is max(547, 547/900 × viewport height) from the fork up -- 608 at 1000 -- and "the band's extra height passes to the construction cell in full, so its inner box is the band less 48". Less the band's bottom rule. */
  expect(Math.round(drawn.innerHeight), 'the band less the 48 margin, less the bottom rule (§30)').toBe(bandHeightAt(1000) - 48 - 1);

  /* §33's fit: the smaller of the two ratios, so the drawing fills exactly one axis. */
  const scale = Math.min(drawn.innerWidth / boxW, drawn.innerHeight / boxH);
  const fillW = (boxW * scale) / drawn.innerWidth;
  const fillH = (boxH * scale) / drawn.innerHeight;
  expect(Math.max(fillW, fillH), 'the binding axis is filled').toBeCloseTo(1, 3);
  expect(Math.min(fillW, fillH), 'and the other is not exceeded').toBeLessThanOrEqual(1 + 1e-6);

  /* And the svg really is the inner box, so the fit above is the one the page draws. */
  expect(drawn.svgWidth, 'the svg fills the inner box').toBeCloseTo(drawn.innerWidth, -0.5);
  expect(drawn.svgHeight).toBeCloseTo(drawn.innerHeight, -0.5);
});

/**
 * **§39 and §40 above §18's fork (steps 44 and 45).** The cover cell takes
 * the spare columns and the upper band carries no air: 4 / 5 / 5 at fourteen
 * columns, 4 / 6 / 6 at sixteen. Every upper cell takes the band's full
 * height, so no strip of band paper shows beneath the identity or cover cell.
 * The square is the largest the cell holds, the bar and block fill the
 * leftover beside it, and any paper left takes the tint step -- measured as
 * the cell's area less the square, the bar and the block. The title ladder's
 * supply stays 510 and does not see the cell's extra height.
 *
 * Flush-right is NOT asserted here: §33's "flush to the cell's top, left and
 * right" no longer holds above the fork once the marks fill the width beside
 * the square, and neither §33 nor WITHDRAWALS.md withdraws it yet. That is
 * Design's, not this file's.
 */
test('§39, §40: above the fork the cover takes the spare columns, every cell the band’s height, the square the largest it holds, and the marks the leftover', async ({ page }) => {
  test.setTimeout(240_000);
  await login(page);
  const id = await seed(page);
  const seen: string[] = [];
  for (const [width, height] of [[1680, NO_SCROLL_HEIGHT], [1920, 950], [1920, 1080], [1920, 1200]] as const) {
    await page.setViewportSize({ width, height });
    await page.goto(`/records/${id}`);
    await page.locator('[data-title-step][data-ladder]').waitFor({ timeout: 20_000 });
    await page.waitForTimeout(600);
    const m = await page.evaluate(() => {
      const q = (sel: string) => document.querySelector<HTMLElement>(sel)!;
      const band = q('[data-band="identity"]');
      /* clientHeight is the padding box: the band's 1px bottom rule is already outside it. */
      const bandInner = band.clientHeight;
      const cell = (n: string) => { const b = q(`[data-cell="${n}"]`).getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height * 10) / 10 }; };
      const sleeve = q('[data-cell="sleeve"]').getBoundingClientRect();
      const rel = (el: Element) => { const r = el.getBoundingClientRect(); return { l: r.left - sleeve.left, t: r.top - sleeve.top, w: r.width, h: r.height }; };
      const cover = rel(q('[data-mark="coverFrame"], [data-cover]'));
      const bar = rel(q('[data-mark="sleeveBar"]'));
      const block = rel(q('[data-mark="sleeveBlock"]'));
      const ladder = JSON.parse(q('[data-title-step]').getAttribute('data-ladder') ?? '{}');
      const air = Math.round(band.getBoundingClientRect().width - cell('identity').w - cell('still').w - cell('sleeve').w);
      const paper = sleeve.width * sleeve.height - cover.w * cover.h - bar.w * bar.h - block.w * block.h;
      return { bandInner: Math.round(bandInner * 10) / 10, cells: { identity: cell('identity'), still: cell('still'), sleeve: cell('sleeve') }, air, cover, bar, block, paper: Math.round(paper), supply: ladder.supply, tint: getComputedStyle(q('[data-cell="sleeve"]')).backgroundColor };
    });
    const spans = upperSpansAt(width);
    const col = width / (spans.identity + spans.still + spans.sleeve);
    seen.push(`${width}x${height}: band ${m.bandInner}, cells ${m.cells.identity.w}/${m.cells.still.w}/${m.cells.sleeve.w} × ${m.cells.identity.h}/${m.cells.still.h}/${m.cells.sleeve.h}, square ${Math.round(m.cover.w)}, bar ${Math.round(m.bar.w)}×${Math.round(m.bar.h)} at (${Math.round(m.bar.l)},${Math.round(m.bar.t)}), block ${Math.round(m.block.w)}×${Math.round(m.block.h)}, paper ${m.paper}px², supply ${m.supply}, ground ${m.tint}`);
    expect(m.air, `${width}: no air in the upper band (§39)`).toBe(0);
    expect(m.cells.sleeve.w, `${width}: the cover cell takes ${spans.sleeve} columns`).toBe(Math.round(col * spans.sleeve));
    expect(m.cells.still.w, `${width}: the construction keeps ${spans.still}`).toBe(Math.round(col * spans.still));
    for (const [name, c] of Object.entries(m.cells)) expect(Math.abs(c.h - m.bandInner), `${width}x${height}: ${name} takes the band's height (${c.h} of ${m.bandInner})`).toBeLessThanOrEqual(1);
    const largest = Math.min(m.cells.sleeve.w, m.cells.sleeve.h);
    expect(m.cover.w, `${width}x${height}: the square is the largest the cell holds`).toBeCloseTo(largest, 0);
    expect(m.cover.h, 'and square').toBeCloseTo(largest, 0);
    expect(m.cover.l, 'flush left').toBeCloseTo(0, 0);
    expect(m.cover.t, 'flush top').toBeCloseTo(0, 0);
    if (m.cells.sleeve.w > m.cells.sleeve.h) {
      expect(m.bar.l, 'the bar starts at the square’s right').toBeCloseTo(largest, 0);
      expect(m.bar.w, 'the bar fills the leftover width').toBeCloseTo(m.cells.sleeve.w - largest, 0);
      expect(m.bar.h, 'the bar takes §23’s share of the height').toBeCloseTo(largest * STRIP_SPLIT.bar, 0);
      expect(m.block.t, 'the block follows beneath it').toBeCloseTo(m.bar.h, 0);
      expect(m.bar.h + m.block.h, 'together they run the square’s height').toBeCloseTo(largest, 0);
    } else {
      expect(m.bar.t, 'the bar starts at the square’s foot').toBeCloseTo(largest, 0);
      expect(m.bar.w + m.block.w, 'together they fill the width').toBeCloseTo(m.cells.sleeve.w, 0);
      expect(m.bar.h, 'the bar fills the leftover height').toBeCloseTo(m.cells.sleeve.h - largest, 0);
    }
    expect(m.paper, `${width}x${height}: no paper left in the cover cell`).toBeLessThanOrEqual(2);
    expect(m.supply, `${width}x${height}: the ladder's supply stays 510 (§40)`).toBe(510);
  }
  console.log(`  §39/§40 UPPER BAND:\n    ${seen.join('\n    ')}`);
});
