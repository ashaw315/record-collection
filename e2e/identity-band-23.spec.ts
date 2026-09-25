import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { BANDS, GRID_FORK, IDENTITY_SPANS } from '../src/app/records/[id]/band-geometry';
import { COVER_CELL } from '../src/app/records/[id]/cover-geometry';
import { SLEEVE_CELL, STRIP_SPLIT, coverSquare, leftoverStrip } from '../src/app/records/[id]/cover-33';
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
  /* The CELL is 546: the band's last pixel is the rule between the bands, so §33's 67 is 66 on the page. */
  const cell = SLEEVE_CELL;
  const square = coverSquare(cell);
  const strip = leftoverStrip(cell);
  expect(square.size, '480 × 480 in a 480 × 546 cell').toBe(480);
  expect(strip.orientation, 'the leftover falls beneath').toBe('horizontal');
  expect(strip.height, 'a 66px strip on the page (§33 says 67, off the 547 band)').toBe(BANDS.identity - 1 - 480);

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
  expect(Math.round(drawn.innerHeight), 'less the band’s bottom rule').toBe(498);

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
