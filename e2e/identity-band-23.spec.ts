import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { BANDS, GRID_FORK, IDENTITY_SPANS } from '../src/app/records/[id]/band-geometry';
import { COVER, COVER_PAD, COVER_GAP, COVER_COLUMN, BAR_BOTTOM, BLOCK_BOTTOM } from '../src/app/records/[id]/cover-geometry';
import { CONSTRUCTION_FRAME } from '../src/app/records/[id]/construction';
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

test('§23: the cover cell — 26 + 414 + 10 + 30, bar above the block in one column', async ({ page }) => {
  await login(page);
  const id = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });
  await page.goto(`/records/${id}`);
  await page.waitForTimeout(600);

  /* The ruled widths close, and this pins them closing. */
  expect(COVER_PAD + COVER + COVER_GAP + COVER_COLUMN, '26 + 414 + 10 + 30 = 480').toBe(GRID_FORK / 3);

  const m = await page.evaluate(() => {
    const cell = document.querySelector('[data-band="identity"] > [data-cell="sleeve"]')!.getBoundingClientRect();
    const rel = (el: Element | null) => {
      if (el === null) return null;
      const r = el.getBoundingClientRect();
      return { l: Math.round(r.left - cell.left), t: Math.round(r.top - cell.top), r: Math.round(cell.right - r.right), b: Math.round(r.bottom - cell.top), w: Math.round(r.width), h: Math.round(r.height) };
    };
    /* §5.3: with no cover the frame stands at the cover's exact size. */
    return {
      cellH: Math.round(cell.height),
      cover: rel(document.querySelector('[data-mark="coverFrame"], [data-cover]')),
      bar: rel(document.querySelector('[data-mark="sleeveBar"]')),
      block: rel(document.querySelector('[data-mark="sleeveBlock"]')),
    };
  });

  /* The cover: 414 square, 26 in from the left and the top. */
  expect(m.cover, 'the cover (or its §5.3 frame) is drawn').not.toBeNull();
  expect(m.cover!.w, 'cover width').toBe(COVER);
  expect(m.cover!.h, 'cover height — a square').toBe(COVER);
  expect(m.cover!.l, 'cover sits 26 from the left').toBe(COVER_PAD);
  expect(m.cover!.t, 'cover sits 26 from the top').toBe(COVER_PAD);

  /* The column: 30 wide, at the cell's right edge, shared. */
  expect(m.bar!.w, 'the bar is the column’s width').toBe(COVER_COLUMN);
  expect(m.block!.w, 'the block is the column’s width').toBe(COVER_COLUMN);
  expect(m.bar!.r, 'the bar is at the cell’s right edge').toBe(0);
  expect(m.block!.r, 'the block is at the cell’s right edge').toBe(0);
  expect(m.bar!.l - (m.cover!.l + m.cover!.w), 'a 10px gap between cover and column').toBe(COVER_GAP);

  /* Bar above, block below — the ruled extents, 26 → 398 → 544. */
  expect(m.bar!.t, 'the bar starts with the cover').toBe(COVER_PAD);
  expect(m.bar!.b, 'the bar ends at 398').toBe(BAR_BOTTOM);
  expect(m.block!.t, 'the block starts where the bar ends').toBe(BAR_BOTTOM);
  expect(m.block!.b, 'the block ends at the band’s foot').toBe(BLOCK_BOTTOM);

  /* Paper below the cover: the cover ends well above the band, and nothing else is drawn in that width. */
  expect(m.cover!.b, 'the cover ends inside the band, leaving paper below').toBeLessThan(m.cellH - 60);

  /* §23 as tracked: the 26 applies to the column's top only, and the block runs to the foot. */
  expect(m.block!.b, 'the block reaches the band’s foot, not 3px short of it').toBe(m.cellH);
});

test('§32: the FRAME fills the cell, which is constant against constant', async ({ page }) => {
  /**
   * **§32 moves the fill assertion from each record to the frame, and
   * withdraws the per-record height floor.**
   *
   * §23 asserted that the construction fills over half its cell's height,
   * against the 41.9% the old 360-wide cell gave. Under §31's one fixed
   * frame that became a claim about whichever record the test happened to
   * seed: the seventeen span 35.6% to 72.4%, so a different seed would have
   * passed and hidden the conflict. §32: "any threshold inside that range
   * would pick a winner between §23 and §17 without saying so", because the
   * spread IS the per-record offset that §17 requires to show.
   *
   * So the claim is about two constants. The frame is 294.8 × 313.6 (§31)
   * and the cell's inner box is 432 × 499 (§26's 24px margin), so the fit is
   * height-bound at 432 × 459.6 — **92% of the cell's height**. It varies
   * with no record, and it still catches the defect §23 was written for: a
   * drawing whose aspect does not match its cell's filled 66% of the height
   * and would fail this.
   *
   * On the shared extremes fixture (§27, build step 19), because a seed
   * record is exactly what let the old test hide a conflict.
   */
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
      cellHeight: box.height,
      cellWidth: box.width,
      innerHeight: box.height - parseFloat(style.paddingTop) - parseFloat(style.paddingBottom),
      innerWidth: box.width - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight),
      viewBox: svg.getAttribute('viewBox'),
      svgHeight: svg.getBoundingClientRect().height,
      svgWidth: svg.getBoundingClientRect().width,
    };
  });

  /*
    The two constants, read off the page rather than retyped.

    **§31: "fit is asserted at render as well as in the measuring pass,
    because §27's fixture path and the render path could differ by a rounding,
    and the point of §31 is a constant both agree on."** So the viewBox the
    browser received is compared with the constant the generator states, and
    the unit tests compare that constant with the measured union.
  */
  expect(drawn.viewBox, 'the page draws §31’s stated frame').toBe(CONSTRUCTION_FRAME);
  const [, , frameW, frameH] = (drawn.viewBox ?? '0 0 1 1').split(' ').map(Number);
  expect(Math.round(drawn.innerWidth), 'the cell’s inner box after §26’s 24px margin').toBe(432);
  /*
    **498 where §32 says 499: the band's bottom hairline sits inside the
    cell's content box.** The band is 547 and the margin takes 48, which is
    §32's 499; the rule takes the last pixel. The frame is width-bound here,
    so the height has slack and the pixel changes nothing about the fit — it
    is asserted rather than rounded away so a change to the rule cannot move
    the box silently.
  */
  expect(Math.round(drawn.innerHeight), 'less the band’s bottom rule').toBe(498);

  /*
    The fit is the smaller of the two ratios (§26). With a frame taller than
    wide in a box taller than wide, it binds on WIDTH: 432 / 294.8 = 1.465,
    which draws 313.6 × 1.465 = 459.6 of the 499 available.
  */
  const scale = Math.min(drawn.innerWidth / frameW, drawn.innerHeight / frameH);
  const drawnHeight = frameH * scale;
  /*
    §32 computes 459.6 from the union 294.8 × 313.6; §31 states the frame
    rounded up to 296 × 314, which draws 458.0. The rounding is §31's
    tolerance — it costs every record the same 0.41% of scale — so the figure
    is asserted against the stated constant rather than against §32's
    pre-rounding arithmetic.
  */
  expect(drawnHeight, 'the frame draws 458 tall at §31’s rounded constant').toBeCloseTo(458, 0);

  /*
    **§32's 92% is of the INNER box, not of the cell, and the section labels
    it "of the cell's height".** 459.6 ÷ 499 = 92.1%; 459.6 ÷ 547 = 84.0%.
    Both figures are right and only the label slipped, so both are asserted
    here: the ratio §32 computed, against the box it computed it from, and
    the same height against the cell that contains it. Reported to Design
    rather than picking one, since the number that matters — the drawn
    height — is the same either way.
  */
  const fillOfInner = (drawnHeight / drawn.innerHeight) * 100;
  const fillOfCell = (drawnHeight / drawn.cellHeight) * 100;
  expect(fillOfInner, `§32's ratio: ${fillOfInner.toFixed(1)}% of the inner box`).toBeCloseTo(92, 0);
  expect(fillOfCell, `and ${fillOfCell.toFixed(1)}% of the cell itself`).toBeCloseTo(84, 0);

  /*
    And the SVG really is that box: the element fills the inner box, so the
    fit above is the fit the page draws rather than one this test computed
    beside it. `preserveAspectRatio="meet"` does the fitting inside it.
  */
  expect(drawn.svgWidth, 'the svg fills the inner box').toBeCloseTo(drawn.innerWidth, -0.5);
  expect(drawn.svgHeight).toBeCloseTo(drawn.innerHeight, -0.5);
});
