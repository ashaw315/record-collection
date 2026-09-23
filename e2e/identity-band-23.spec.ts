import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { BANDS, GRID_FORK, IDENTITY_SPANS } from '../src/app/records/[id]/band-geometry';
import { COVER, COVER_PAD, COVER_GAP, COVER_COLUMN, BAR_BOTTOM, BLOCK_BOTTOM } from '../src/app/records/[id]/cover-geometry';

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
  expect(m.block!.b, 'the block ends at 544').toBe(BLOCK_BOTTOM);

  /* Paper below the cover: the cover ends well above the band, and nothing else is drawn in that width. */
  expect(m.cover!.b, 'the cover ends inside the band, leaving paper below').toBeLessThan(m.cellH - 60);

  /*
    **The open input, measured rather than resolved.** 26 → 544 sits inside
    547, so the ruled column does not overflow; what does not close is the
    bottom padding, 3 against the top's 26. Design has been asked whether the
    band is 547 or 570. This records the asymmetry so it is visible in the
    run, and asserts only that the block is INSIDE the band — a crop would be
    the one outcome worse than either answer.
  */
  console.log(`§23 open input: block bottom ${m.block!.b} in a ${m.cellH} band — bottom padding ${m.cellH - m.block!.b} against top ${COVER_PAD}`);
  expect(m.block!.b, 'the block is not cropped by the band').toBeLessThanOrEqual(m.cellH);
});

test('§23: the construction fills its cell’s height, which is what the correction was for', async ({ page }) => {
  await login(page);
  const id = await seed(page);
  await page.setViewportSize({ width: GRID_FORK, height: 1000 });
  await page.goto(`/records/${id}`);
  await page.waitForTimeout(800);

  const fill = await page.evaluate(() => {
    const cell = document.querySelector('[data-cell="still"]')!.getBoundingClientRect();
    const svg = document.querySelector('[data-cell="still"] svg')!;
    let l = Infinity, t = Infinity, r = -Infinity, b = -Infinity;
    for (const p of Array.from(svg.querySelectorAll('polygon'))) {
      if (Number(getComputedStyle(p).opacity) < 0.5) continue;
      const box = (p as SVGGraphicsElement).getBoundingClientRect();
      l = Math.min(l, box.left); t = Math.min(t, box.top); r = Math.max(r, box.right); b = Math.max(b, box.bottom);
    }
    return { fillW: (r - l) / cell.width * 100, fillH: (b - t) / cell.height * 100 };
  });
  console.log(`§23 construction fill: ${fill.fillW.toFixed(1)}% wide, ${fill.fillH.toFixed(1)}% tall (opaque polygons; disc and shadows excluded)`);

  /* Before §23 the height fill was 41.9%: half the cell dead. The correction is the height. */
  expect(fill.fillH, 'height fill rose from the 41.9% the 360 cell gave').toBeGreaterThan(50);
});
