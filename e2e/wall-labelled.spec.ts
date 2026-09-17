import { expect, test, type Page } from '@playwright/test';
import { SPINE_WIDTH_MIN, frontFace, layoutRow } from '../src/app/wall/geometry';
import { intoShelves } from '../src/app/wall/shelf-rows';
import { SPINE_TEXT_BUDGET, spineLabel } from '../src/app/wall/spine-text';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';

/**
 * The 1:1 component (The Wall 5b §1, §4, §5; 8a §11), on the real collection.
 *
 * What the overview could not assert: that labels render at 1:1 in the
 * drawing's own geometry, in ink, truncated at the budget, and inside the
 * spine they name. And what only a rendering can: that the labelled component
 * draws the SAME polygons the overview does, by import rather than by
 * coincidence.
 *
 * **§11: the wall at rest is line, ink and paper — no derived colour anywhere
 * in the drawing.** A spine at rest takes no colour; colour arrives with the
 * pull. So the stored-colour and ink-pick claims this spec first made are
 * withdrawn with the fills, and replaced by the one that supersedes them: that
 * nothing in the resting drawing carries a fill but `none`.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/wall/probe/labelled');
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
});

test('draws every record as three paper faces at rest — filled for occlusion, none with a hue', async ({
  page,
}) => {
  /*
    Was: unfilled outlines. D2 paints faces back to front, and a painter's
    order only hides what is behind a face if the face is opaque — so faces
    are paper in three steps, and the coverless record is indistinguishable
    from the rest. "No derived colour" is asserted as chroma, over every fill.
  */
  const faces = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat] [data-face]')).map((face) => ({
      face: face.getAttribute('data-face'),
      fill: face.getAttribute('fill') ?? '',
    })),
  );

  expect(faces.filter((f) => f.face === 'front')).toHaveLength(COLLECTION_SPINES.length);
  expect(faces.filter((f) => f.face === 'top')).toHaveLength(COLLECTION_SPINES.length);
  expect(faces.filter((f) => f.face === 'right')).toHaveLength(COLLECTION_SPINES.length);
  for (const { face, fill } of faces) {
    const chroma = Number(/oklch\([\d.]+ ([\d.]+) /.exec(fill)?.[1]);
    expect(chroma, `${face} ${fill} is paper`).toBeLessThanOrEqual(0.004);
  }
});

test('labels every spine at the drawn size, rotated up the spine, cut to the budget', async ({
  page,
}) => {
  /* By seat id, not DOM order: faces paint back to front, so the DOM is the painter's order. */
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat]')).map((seat) => {
      const label = seat.querySelector('[data-label]');
      return {
        id: seat.getAttribute('data-seat') ?? '',
        text: label?.textContent ?? '',
        size: label?.getAttribute('font-size') ?? null,
        weight: label?.getAttribute('font-weight') ?? null,
        family: label?.getAttribute('font-family') ?? null,
        transform: label?.getAttribute('transform') ?? '',
      };
    }),
  );

  expect(labels).toHaveLength(COLLECTION_SPINES.length);

  for (const label of labels) {
    const row = COLLECTION_SPINES[Number(label.id.replace('collection-', ''))];
    expect(label.text, `${row.title}`).toBe(spineLabel(row.artist, row.title));
    expect([...label.text].length, `${row.title} within the budget`).toBeLessThanOrEqual(
      SPINE_TEXT_BUDGET,
    );
    expect(label.size).toBe('10.39');
    expect(label.weight).toBe('500');
    expect(label.family).toMatch(/Geist Mono/);
    /* D2's matrix: local x up the spine, local y along the row — on the face's own plane. */
    expect(label.transform).toMatch(/^matrix\(0 -1 /);
  }

  /* The drawn truncation, on the drawn record. */
  const donna = labels.find((label) => label.text.startsWith('Donna Summer'));
  expect(donna?.text).toBe('Donna Summer · On The Radio: Greates…');
});

test('sets every label in ink, and nothing in the resting drawing carries a hue', async ({
  page,
}) => {
  /**
   * §11 asserted over the WHOLE svg: every fill is a paper step (chroma ≤
   * 0.004) or the ink — a colour that crept onto a plane, a label or a mark
   * would be the exception leaking somewhere the face assertion does not look.
   */
  const fills = await page.evaluate(() => {
    const svg = document.querySelector('[data-wall="labelled"]');
    if (svg === null) return null;
    return {
      labels: Array.from(svg.querySelectorAll('[data-label]')).map((l) => l.getAttribute('fill')),
      everything: Array.from(svg.querySelectorAll('[fill]')).map((el) => el.getAttribute('fill') ?? ''),
    };
  });
  expect(fills).not.toBeNull();
  if (fills === null) return;

  expect(fills.labels).toHaveLength(COLLECTION_SPINES.length);
  for (const ink of fills.labels) expect(ink).toBe('#161412');

  for (const fill of fills.everything) {
    if (fill === '#161412' || fill === 'none') continue;
    const chroma = Number(/oklch\([\d.]+ ([\d.]+) /.exec(fill)?.[1]);
    expect(chroma, `${fill} — line, ink and paper, nothing else`).toBeLessThanOrEqual(0.004);
  }
});

test('draws the same polygons the overview does, by the shared geometry', async ({ page }) => {
  /**
   * **Inherited, not re-derived.** The spec computes each seat's polygon from
   * `geometry.ts` and compares it to the DOM. A component that settled its own
   * projection — a different shear, its own width hash — would draw something
   * else and fail here, which is the defect the geometry layer exists to close.
   */
  const drawn = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat]')).map((seat) => ({
      id: seat.getAttribute('data-seat') ?? '',
      points: seat.querySelector('[data-spine]')?.getAttribute('points') ?? '',
    })),
  );

  /* Seventeen records over four shelves: each row placed on its own z. */
  const placed = intoShelves(
    COLLECTION_SPINES.map((_, index) => ({ id: `collection-${index}`, section: 'Collection' })),
  ).flatMap((shelf, row) => layoutRow(shelf, row, null));
  drawn.forEach((seat) => {
    const expected = placed.find((p) => p.id === seat.id);
    expect(expected, seat.id).toBeDefined();
    if (expected === undefined) return;
    expect(seat.points, `${seat.id} polygon`).toBe(
      frontFace(expected)
        .map(([px, py]) => `${px.toFixed(2)},${py.toFixed(2)}`)
        .join(' '),
    );
  });
});

test('keeps every label inside the spine it names', async ({ page }) => {
  /*
    A 9px label occupies a 13.5-unit band across the spine; the thinnest spine
    is 17. Measured on the rendering rather than asserted from those two
    numbers, because the baseline offset is a third number and a wrong one puts
    the label over the next spine.
  */
  /*
    **`getBoundingClientRect`, not `getBBox`.** The label is rotated, and
    `getBBox` reports the box BEFORE the transform — so the run's length read
    as its width, 143px "across" a 24px spine, and the first version of this
    test failed on every seat. The rendered rectangle is the one the claim is
    about. Both boxes are read the same way, so the viewBox scale cancels.
  */
  const boxes = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat]')).map((seat) => {
      const spine = seat.querySelector('[data-spine]')!.getBoundingClientRect();
      const label = seat.querySelector('[data-label]')!.getBoundingClientRect();
      return {
        id: seat.getAttribute('data-seat'),
        spineLeft: spine.left,
        spineRight: spine.right,
        spineHeight: spine.height,
        labelLeft: label.left,
        labelRight: label.right,
        labelHeight: label.height,
      };
    }),
  );

  for (const box of boxes) {
    expect(box.labelLeft, `${box.id} label left edge`).toBeGreaterThanOrEqual(box.spineLeft - 0.5);
    expect(box.labelRight, `${box.id} label right edge`).toBeLessThanOrEqual(box.spineRight + 0.5);
    expect(box.labelHeight, `${box.id} run fits the spine`).toBeLessThanOrEqual(box.spineHeight);
  }
  expect(SPINE_WIDTH_MIN, 'the thinnest spine still holds the band').toBeGreaterThanOrEqual(14);
});

test('renders at 1:1 — the svg is its viewBox width on screen — and pans rather than scaling (D1)', async ({
  page,
}) => {
  const oneToOne = await page.evaluate(() => {
    const svg = document.querySelector('[data-wall="labelled"]');
    if (!(svg instanceof SVGSVGElement)) return null;
    return { drawn: svg.viewBox.baseVal.width, shown: svg.getBoundingClientRect().width };
  });
  expect(oneToOne).not.toBeNull();
  if (oneToOne === null) return;
  expect(oneToOne.shown).toBeCloseTo(oneToOne.drawn, 0);

  /* Two hundred records: wider than the region, so the region scrolls and the labels stay at the floor. */
  await page.goto('/wall/probe/labelled?count=200');
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  const wide = await page.evaluate(() => {
    const region = document.querySelector('[data-region="wall"]');
    const svg = document.querySelector('[data-wall="labelled"]');
    const label = document.querySelector('[data-label]');
    if (!(region instanceof HTMLElement) || !(svg instanceof SVGSVGElement) || label === null) return null;
    return {
      pans: region.scrollWidth > region.clientWidth,
      shown: svg.getBoundingClientRect().width,
      drawn: svg.viewBox.baseVal.width,
      labels: document.querySelectorAll('[data-label]').length,
      size: label.getAttribute('font-size'),
    };
  });
  expect(wide).not.toBeNull();
  if (wide === null) return;
  expect(wide.pans, 'the region pans').toBe(true);
  expect(wide.shown, 'still 1:1').toBeCloseTo(wide.drawn, 0);
  expect(wide.labels).toBe(200);
  expect(wide.size).toBe('10.39');
});

test('removes labels only when the viewport cannot hold one record (§5 as a guard)', async ({
  page,
}) => {
  await page.setViewportSize({ width: 200, height: 900 });
  await page.goto('/wall/probe/labelled');
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  await expect(page.locator('[data-label]')).toHaveCount(0);
  await expect(page.locator('[data-face="front"]')).toHaveCount(COLLECTION_SPINES.length);

  await page.setViewportSize({ width: 1440, height: 900 });
  await expect(page.locator('[data-label]')).toHaveCount(COLLECTION_SPINES.length);
});
