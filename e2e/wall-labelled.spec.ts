import { expect, test, type Page } from '@playwright/test';
import { SPINE_WIDTH_MIN, spinePolygon, spineWidth } from '../src/app/wall/geometry';
import { SPINE_TEXT_BUDGET, spineLabel } from '../src/app/wall/spine-text';
import { pickInk } from '../src/app/wall/spine-ink';
import { contrastRatio } from '../src/lib/colour/record-colour';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';

/**
 * The 1:1 component (The Wall 5b §1, §4, §5), on the real collection.
 *
 * What the overview could not assert: that labels render at 1:1 in the
 * drawing's own geometry, with ink picked per fill, truncated at the budget,
 * and inside the spine they name. And what only a rendering can: that the
 * labelled component draws the SAME polygons the overview does, by import
 * rather than by coincidence.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const withCover = COLLECTION_SPINES.filter((row) => row.resampled !== null);

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto('/wall/probe/labelled');
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
});

test('draws every record with its own stored colour, and the coverless one unfilled', async ({
  page,
}) => {
  const fills = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat] [data-spine]')).map((spine) =>
      spine.getAttribute('fill'),
    ),
  );

  expect(fills).toHaveLength(COLLECTION_SPINES.length);
  expect(fills.filter((fill) => fill === 'none'), 'one unfilled where no cover exists').toHaveLength(1);

  const expected = COLLECTION_SPINES.map((row) => row.resampled ?? 'none');
  expect(fills).toEqual(expected);
});

test('labels every spine at the drawn size, rotated up the spine, cut to the budget', async ({
  page,
}) => {
  const labels = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat] [data-label]')).map((label) => ({
      text: label.textContent ?? '',
      size: label.getAttribute('font-size'),
      weight: label.getAttribute('font-weight'),
      family: label.getAttribute('font-family'),
      transform: label.getAttribute('transform') ?? '',
    })),
  );

  expect(labels).toHaveLength(COLLECTION_SPINES.length);

  for (const [index, label] of labels.entries()) {
    const row = COLLECTION_SPINES[index];
    expect(label.text, `${row.title}`).toBe(spineLabel(row.artist, row.title));
    expect([...label.text].length, `${row.title} within the budget`).toBeLessThanOrEqual(
      SPINE_TEXT_BUDGET,
    );
    expect(label.size).toBe('10.39');
    expect(label.weight).toBe('500');
    expect(label.family).toMatch(/Geist Mono/);
    expect(label.transform).toMatch(/rotate\(-90\)/);
  }

  /* The drawn truncation, on the drawn record. */
  const donna = labels.find((label) => label.text.startsWith('Donna Summer'));
  expect(donna?.text).toBe('Donna Summer · On The Radio: Greates…');
});

test('picks each label ink from the four candidates, and every pick clears 4.5:1', async ({
  page,
}) => {
  /**
   * **Re-run, not copied.** 5b's picks were against pre-A75 fills. The
   * component picks against whatever the fill is now, and the test asserts the
   * pick is the RULE's output — the best of four — rather than a table.
   */
  const pairs = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat]')).map((seat) => ({
      fill: seat.querySelector('[data-spine]')?.getAttribute('fill') ?? null,
      ink: seat.querySelector('[data-label]')?.getAttribute('fill') ?? null,
    })),
  );

  for (const pair of pairs) {
    if (pair.fill === null || pair.fill === 'none') continue;
    const expected = pickInk(pair.fill);
    expect(pair.ink, `ink on ${pair.fill}`).toBe(expected.ink);
    expect(contrastRatio(pair.fill, pair.ink ?? ''), `${pair.fill} legible`).toBeGreaterThanOrEqual(
      4.5,
    );
  }

  /* And the pick is not degenerate on today's fills: both dark and light inks are used. */
  const inks = new Set(pairs.map((pair) => pair.ink));
  expect(inks.size, 'more than one ink on the raw fills').toBeGreaterThan(1);
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

  drawn.forEach((seat, index) => {
    const x = index * 24;
    const expected = spinePolygon(x, 0, spineWidth(seat.id))
      .map(([px, py]) => `${px},${py}`)
      .join(' ');
    expect(seat.points, `${seat.id} polygon`).toBe(expected);
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
