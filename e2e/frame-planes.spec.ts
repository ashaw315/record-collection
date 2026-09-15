import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';

registerCleanup();

/**
 * §5.1 — **a mark that touches a page edge is a flat plane; a mark that does
 * not is an isometric solid.**
 *
 * **Nothing tested that a mark is the shape its name says**, and that is how
 * the frame ended up with three cubes called `identityTriangle`,
 * `provenanceArc` and `aboutArc`. They were built flat, correctly replaced with
 * isometric solids under a ruling on 13 Sep, and that ruling was later reversed
 * in the drawing — *"that was true for one turn, under the withdrawn isometric
 * ruling, and is not true now"* — with nothing propagating to the build.
 *
 * **When a ruling is reversed, the code implementing the original does not
 * fail.** No test breaks, no type changes, and the only evidence was three
 * names disagreeing with what they drew.
 *
 * So this asserts the SHAPE, which is the claim the names were making: a plane
 * is one fill, and a solid is three faces at three lightnesses.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `p${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect([200, 201], `${path} ${response.status()}`).toContain(response.status());
  return response.json();
}

async function aRecord(page: Page, suffix: string): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `Vandross-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `FE-${suffix}`,
    matrixRunout: `MX-${suffix}`,
    yearPressed: 1981,
    countryPressed: 'United States',
  });
  const record = await post(page, '/api/records', {
    title: `Never Too Much ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
    releaseYear: 1981,
    purchasePrice: '18.00',
    notes: `A note ${suffix}`,
  });
  await seedImage({ recordId: record.id as string, imageType: 'cover' });
  /*
    **A journal entry, because the About arc is suppressed on an empty cell
    (§5.4).** Without one the mark the test is written for is not on the page,
    and the assertion would pass or fail for a reason that has nothing to do
    with its shape.
  */
  await post(page, `/api/records/${record.id}/journal`, {
    note: `Bought it ${suffix}`,
    entryDate: '2024-03-14',
  });
  await getTestDb().execute(
    sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${record.id}::uuid`,
  );
  return record.id as string;
}

/** The three §5.1 planes, by the name each already carries. */
const PLANES = ['identityTriangle', 'provenanceArc', 'aboutArc'] as const;

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the three edge fields are flat planes, not isometric solids', async ({ page }) => {
  /**
   * **One fill, no faces.** An isometric solid is three polygons at three
   * opacities — which is exactly what these were rendering, and what makes the
   * distinction checkable without judgement: count the painted regions.
   */
  const suffix = makeSuffix();
  const id = await aRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

  const marks = await page.evaluate((names: readonly string[]) =>
    names.map((name) => {
      const mark = document.querySelector(`[data-mark="${name}"]`);
      if (mark === null) return { name, present: false };

      /*
        A solid draws its faces as polygons at three opacities; a plane is one
        painted region. Counting polygons is the check — the opacity set is
        empty for a plane because there are no face nodes to carry one, which
        is a consequence rather than the claim.
      */
      const polygons = mark.querySelectorAll('polygon').length;
      const faceOpacities = Array.from(mark.querySelectorAll('polygon')).map(
        (node) => node.getAttribute('opacity') ?? '1',
      );
      return { name, present: true, polygons, faceOpacities };
    }),
  PLANES as unknown as string[]);

  for (const mark of marks) {
    expect(mark.present, `${mark.name} renders`).toBe(true);
    expect(mark.polygons, `${mark.name} is not built from faces`).toBe(0);
    expect(
      mark.faceOpacities,
      `${mark.name} has no faces to carry three lightnesses`,
    ).toEqual([]);
  }
});

test('each plane is the shape its name says', async ({ page }) => {
  /**
   * **The claim the names were making and nothing checked.** A triangle is a
   * clip path with three points; a quarter-circle is a corner radius on one
   * corner. Read off the computed style, so a mark renamed without being
   * redrawn fails here.
   */
  const suffix = makeSuffix();
  const id = await aRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

  const shapes = await page.evaluate(() => {
    const read = (name: string) => {
      const mark = document.querySelector(`[data-mark="${name}"]`);
      if (mark === null) return null;
      const style = getComputedStyle(mark);
      return { clipPath: style.clipPath, borderRadius: style.borderRadius };
    };
    return {
      triangle: read('identityTriangle'),
      provenance: read('provenanceArc'),
      about: read('aboutArc'),
    };
  });

  expect(shapes.triangle, 'the triangle renders').not.toBeNull();
  expect(shapes.triangle?.clipPath, 'three points, not a box').toMatch(/polygon\(/);

  for (const [name, arc] of [
    ['provenance', shapes.provenance],
    ['about', shapes.about],
  ] as const) {
    expect(arc, `the ${name} arc renders`).not.toBeNull();
    /* A quarter-circle is one rounded corner, not four. */
    expect(arc?.borderRadius, `${name} is a quarter, not a disc`).toMatch(/\d/);
    expect(arc?.borderRadius, `${name} rounds one corner`).not.toMatch(/^(\d+px)$/);
  }
});

test('the triangle lives in the ornament track and yields with it', async ({ page }) => {
  /**
   * §4.2's corner reserve: the triangle shrinks from 140px as the title grows —
   * 115.4 at three lines, 47.7 at four, gone at five — which is the same track
   * mechanism the identity cell already has.
   *
   * **In the track rather than positioned against the cell**, so the yielding
   * is structural: a mark placed absolutely would keep its size while the
   * reserve it is supposed to occupy shrank underneath it.
   */
  const suffix = makeSuffix();
  const id = await aRecord(page, suffix);
  await page.goto(`/records/${id}`);
  await page.getByTestId('record-page-8a').waitFor({ timeout: 20_000 });

  const placed = await page.evaluate(() => {
    const mark = document.querySelector('[data-mark="identityTriangle"]');
    if (mark === null) return null;
    const track = mark.closest('[data-track="ornament"]');
    const trackBox = track?.getBoundingClientRect();
    const markBox = mark.getBoundingClientRect();
    return {
      inTrack: track !== null,
      trackHeight: trackBox === undefined ? null : Math.round(trackBox.height),
      markHeight: Math.round(markBox.height),
    };
  });

  expect(placed, 'the triangle renders').not.toBeNull();
  expect(placed?.inTrack, 'it sits in the ornament track').toBe(true);
  /* It fills the reserve it is given rather than overflowing it. */
  expect(placed?.markHeight).toBeLessThanOrEqual((placed?.trackHeight ?? 0) + 1);
});
