import { expect, test, type Page } from '@playwright/test';
import { SPINE_WIDTH_MIN, spinePolygon, spineWidth } from '../src/app/wall/geometry';
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

test('draws every spine as an unfilled outline at rest — the coverless one indistinguishable', async ({
  page,
}) => {
  /*
    Was: every record with its own stored colour, and one unfilled where no
    cover exists. §11 withdraws the fills, and with them the one distinction
    the coverless record had at rest: seventeen outlines, none filled.
  */
  const spines = await page.evaluate(() =>
    Array.from(document.querySelectorAll('[data-seat] [data-spine]')).map((spine) => ({
      fill: spine.getAttribute('fill'),
      stroke: spine.getAttribute('stroke'),
    })),
  );

  expect(spines).toHaveLength(COLLECTION_SPINES.length);
  for (const spine of spines) {
    expect(spine.fill).toBe('none');
    expect(spine.stroke).toBe('#161412');
  }
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

test('sets every label in ink, and no derived colour appears anywhere in the drawing', async ({
  page,
}) => {
  /**
   * Was: ink picked per fill from 5b's four candidates. With no fill there is
   * nothing to pick against, and §11 withdraws the pick at rest. The second
   * half is the ruling itself, asserted over the WHOLE svg rather than the
   * spines: a fill that crept onto a shelf, a label or a mark would be the same
   * exception leaking somewhere the spine assertion does not look.
   */
  const fills = await page.evaluate(() => {
    const svg = document.querySelector('[data-wall="labelled"]');
    if (svg === null) return null;
    return {
      labels: Array.from(svg.querySelectorAll('[data-label]')).map((l) => l.getAttribute('fill')),
      everything: Array.from(svg.querySelectorAll('[fill]')).map((el) => el.getAttribute('fill')),
    };
  });
  expect(fills).not.toBeNull();
  if (fills === null) return;

  expect(fills.labels).toHaveLength(COLLECTION_SPINES.length);
  for (const ink of fills.labels) expect(ink).toBe('#161412');

  expect(new Set(fills.everything), 'line, ink and paper — nothing else').toEqual(
    new Set(['none', '#161412']),
  );
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
