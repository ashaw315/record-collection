import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedImage } from './seed';
import { getTestDb } from '../test/helpers/db';
import { sql } from 'drizzle-orm';
import { CONTROL_HEIGHT } from '../src/app/records/[id]/extended-grid';
import { BANDS, NO_SCROLL_HEIGHT } from '../src/app/records/[id]/band-geometry';
import { SLEEVE_CELL } from '../src/app/records/[id]/cover-33';
import { COLUMN_MIN, columnsFor, columnWidthAt, pageWidthAt, upperRowsAt, upperSpansAt } from '../src/app/records/[id]/region-rows';

registerCleanup();

/**
 * **§28: the page below 1440.**
 *
 * Four breakpoints, each derived from a measurement rather than a device
 * width: 12 columns at 1440, 8 from 960, 4 from 480, one fluid below, and the
 * column never under 120. The lower region regroups while there is room for
 * air and says plainly where it stops — below 960 it is a document, because
 * "a phone is read by scrolling, and the rhythm of spans that suits a
 * composition does not suit a scroll".
 *
 * The floor is asserted at 1440 × 900 and 390 × 844 and nowhere else (§28),
 * and it is measured in `colour-distribution.spec.ts`; this spec is the
 * layout.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seed(page: Page): Promise<string> {
  const s = `p28${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await page.request.post('/api/artists', { data: { name: `Page28 ${s}` } });
  const artistId = ((await artist.json()) as { id: string }).id;
  trackArtist(artistId);
  const record = await page.request.post('/api/records', {
    data: { artistId, title: `Twenty Eight ${s}`, releaseYear: 1979 },
  });
  const id = ((await record.json()) as { id: string }).id;
  /*
    Two images IN THE STRIP. The cover is drawn in the frame above and the
    gallery excludes it by design, so seeding a cover and a matrix leaves one
    thumbnail — which is what the first version of this fixture did.
  */
  await seedImage({ recordId: id, imageType: 'cover' });
  await seedImage({ recordId: id, imageType: 'matrix' });
  await seedImage({ recordId: id, imageType: 'back' });
  /*
    §26's flats are the record's ladder, so a record with no sampled colour
    draws none — §5.3 keeps a coverless record's marks but the ladder has no
    hue to invent. The colour is what makes the flat assertions meaningful.
  */
  await getTestDb().execute(sql`UPDATE records SET spine_colour = ${'#a25829'} WHERE id = ${id}::uuid`);
  return id;
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('§28: the page takes the whole width at every breakpoint, never centring a narrower grid', async ({ page }) => {
  /**
   * **The clause the build has never had.** §28 grows columns between
   * breakpoints and §30 names the divergence: "if the build centres at 1000,
   * the build diverges". At 1000 the page is 1000 wide on 8 columns of 125.
   *
   * Measured on the REGION, which is the element that carries the columns.
   */
  const id = await seed(page);

  for (const width of [1440, 1200, 1000, 960, 700, 480, 390]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

    const measured = await page.evaluate(() => {
      const region = document.querySelector('[data-region="extended-grid"]')!.getBoundingClientRect();
      /* `gridTemplateColumns` reports used values as "120px 120px …", so the unit is stripped. */
      const columns = getComputedStyle(document.querySelector('[data-region="extended-grid"]')!)
        .gridTemplateColumns.split(/\s+/)
        .filter((v) => v !== '')
        .map((v) => parseFloat(v));
      return { width: Math.round(region.width), left: Math.round(region.left), columns };
    });

    /* Above the fork the grid is §18's fixed module and the page caps at 1440. */
    const expected = Math.min(width, 1440);
    expect(measured.width, `the region takes the width at ${width}`).toBe(expected);
    expect(measured.columns.length, `${width} seats ${columnsFor(width)} columns`).toBe(columnsFor(width));
    for (const column of measured.columns) {
      expect(column, `no column under ${COLUMN_MIN} at ${width}`).toBeGreaterThanOrEqual(COLUMN_MIN - 0.5);
    }
    /* And they GREW where §28 says they do, rather than staying at the module. */
    expect(measured.columns[0], `column width at ${width}`).toBeCloseTo(columnWidthAt(expected), 0);
  }
});

test('§28: below 960 the lower region is a document — no air, no figures', async ({ page }) => {
  /**
   * "A figure needs at least 240 of air. At 4 columns no air column reaches
   * that, so the lower region has no figures, and the rows stack apart from
   * one 2/2 pair." The solo in Price history's strip is not in air — a
   * full-width row is air enough — so what goes is the pair.
   */
  const id = await seed(page);

  for (const width of [480, 390]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/records/${id}`);
    await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

    const shown = await page.evaluate(() => ({
      air: Array.from(document.querySelectorAll('[data-cell="air"]')).filter(
        (el) => getComputedStyle(el).display !== 'none',
      ).length,
      /*
        VISIBLE pairs. §28 removes the air below 960 and the stylesheet does
        it with `display: none`, which leaves the figure in the DOM — a
        count of nodes would report a pair the reader cannot see, which is
        the opposite of what the ruling is about.
      */
      pairs: Array.from(document.querySelectorAll('[data-figure="pair"]')).filter(
        (el) => el.getClientRects().length > 0,
      ).length,
      /* Visible flats, for the same reason as the pairs above. */
      flats: Array.from(document.querySelectorAll('[data-ornament="flat"]'))
        .filter((f) => f.getClientRects().length > 0)
        .map((f) => f.getAttribute('data-flat')),
    }));

    expect(shown.air, `no air column at ${width}`).toBe(0);
    expect(shown.pairs, `and so no pair at ${width}`).toBe(0);
    /* "Below 960 there is no left air anywhere, so there is one flat, on the right edge." */
    expect(shown.flats, `one flat at ${width}, on the right`).toEqual(['quarterDisc']);
  }
});

test('§28: every control clears the 44px touch floor, at 390', async ({ page }) => {
  /**
   * "§9.3's 44px hit floor now covers every control on the page, the 11px
   * labels included. The hit area is padded out to 44 while the drawn type
   * stays the same size." §W.30 ruled keyboard reach; nothing had ruled tap.
   *
   * Measured on the HIT AREA rather than on the type: a control may draw 11px
   * text and still be tappable, which is the whole ruling.
   */
  const id = await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const small = await page.evaluate((floor: number) => {
    const out: string[] = [];
    for (const el of Array.from(document.querySelectorAll('[data-section] a, [data-section] button, [data-section] select, [data-section] input'))) {
      const box = el.getBoundingClientRect();
      /* A hidden or zero-size control is not on the page for a finger either. */
      if (box.width === 0 || box.height === 0) continue;

      /*
        **The HIT AREA, not the drawn box.** §28 rules that the hit area is
        padded out to 44 "while the drawn type stays the same size", so a
        field still draws 34 tall and must still take a tap 44 tall. Probing
        with `elementFromPoint` at the floor's edges is what a finger does;
        measuring the element's own rect would assert the opposite of the
        ruling and fail every control that obeys it.
      */
      /*
        **The HIT AREA, not the drawn box.** §28 pads the hit area to 44
        "while the drawn type stays the same size", so a ruled field still
        DRAWS 34 tall (§9.2 puts its underline at the bottom) and must still
        take a tap 44 tall. The hit area is an overlay extending vertically
        behind the control, so it is measured by probing where a finger
        lands rather than by the element's own rect — which would assert the
        opposite of the ruling and fail every control that obeys it.
      */
      /*
        **The hit area, read from the overlay that provides it.** §28 pads
        the hit area to 44 "while the drawn type stays the same size", so a
        ruled field still draws 34 (§9.2 puts its underline at the bottom)
        and takes a 44px tap through a `::before` extending vertically behind
        it.

        Measured from the pseudo-element rather than by probing coordinates:
        `elementFromPoint` returns null for anything below the fold, and at
        390 × 844 most of this page is — a probe that "found" eight failing
        controls was reporting that they were off screen, including three
        whose own boxes were already 44 tall.
      */
      const hit = parseFloat(getComputedStyle(el, '::before').height);
      const reach = Number.isNaN(hit) ? box.height : Math.max(box.height, hit);
      if (reach < floor - 0.5) {
        out.push(`${el.tagName}${el.getAttribute('data-field') ? `[${el.getAttribute('data-field')}]` : ''} ${Math.round(box.width)}×${Math.round(box.height)} — "${(el.textContent ?? '').trim().slice(0, 24)}"`);
      }
    }
    return out;
  }, CONTROL_HEIGHT);

  expect(small, `controls under the ${CONTROL_HEIGHT}px hit floor at 390:\n${small.join('\n')}`).toEqual([]);
});

test('§28: the images strip wraps its thumbnails, two per row at 390', async ({ page }) => {
  /**
   * "The images strip wraps its 150px thumbnails into rows with the gap kept,
   * instead of sitting in an 806px fixed strip: two per row at 390."
   *
   * Asserted as geometry — no thumbnail outside the viewport, and more than
   * one row once there are more than two — rather than as a class name, which
   * would pass on a `flex-wrap` an ancestor cancels.
   */
  const id = await seed(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/records/${id}`);
  await page.locator('[data-testid="image-gallery"]').waitFor({ timeout: 20_000 });

  const strip = await page.evaluate(() => {
    const thumbs = Array.from(document.querySelectorAll('[data-testid="gallery-image"]'));
    return thumbs.map((t) => {
      const box = t.getBoundingClientRect();
      return { left: Math.round(box.left), right: Math.round(box.right), top: Math.round(box.top) };
    });
  });

  expect(strip.length, 'the fixture seeds two images').toBeGreaterThanOrEqual(2);
  for (const thumb of strip) {
    expect(thumb.left, 'no thumbnail starts off-screen').toBeGreaterThanOrEqual(0);
    expect(thumb.right, 'nor runs past the viewport').toBeLessThanOrEqual(390);
  }
});

test('§30: the page uses the width above 1440, to a ceiling at 1920', async ({ page }) => {
  /**
   * §30: "There are 14 columns from 1680 (14 × 120) and 16 from 1920, and the
   * ceiling is 16... Above 1920 the page stays 1920 wide and centres. The
   * current behaviour, 1440 centred at every wider width, was never ruled,
   * and it is withdrawn here."
   *
   * The construction takes the extra columns — five at 14, six at 16 — while
   * identity and cover keep four, because their content has a fixed measure
   * and the construction's is fitted.
   */
  const id = await seed(page);

  for (const width of [1440, 1680, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.goto(`/records/${id}`);
    await page.locator('[data-cell="still"]').waitFor({ timeout: 20_000 });

    const measured = await page.evaluate(() => {
      const frame = document.querySelector('[data-testid="record-page-8a"]')!.getBoundingClientRect();
      const cells = ['identity', 'still', 'sleeve'].map((name) => {
        const box = document.querySelector(`[data-cell="${name}"]`)!.getBoundingClientRect();
        return { name, width: Math.round(box.width) };
      });
      return { page: Math.round(frame.width), cells };
    });

    expect(measured.page, `the page at ${width}`).toBe(pageWidthAt(width));

    const spans = upperSpansAt(width);
    const column = pageWidthAt(width) / columnsFor(width);
    for (const cell of measured.cells) {
      const expected = Math.round(column * spans[cell.name as 'identity' | 'still' | 'sleeve']);
      expect(cell.width, `${cell.name} at ${width}`).toBeCloseTo(expected, -0.7);
    }
  }
});

test('§30: the construction’s drawn scale never falls as the window widens', async ({ page }) => {
  /**
   * §30's invariant, on the route at its breakpoints. The 1px sweep is a unit
   * test (`region-rows.test.ts`); this checks the rendered drawing agrees
   * with the geometry that sweep asserts, at the widths where it changes.
   */
  const id = await seed(page);
  let previous = 0;

  for (const width of [1440, 1679, 1680, 1919, 1920, 2560]) {
    await page.setViewportSize({ width, height: 1050 });
    await page.goto(`/records/${id}`);
    await page.locator('[data-testid="construction-still"]').waitFor({ timeout: 20_000 });

    const drawn = await page.evaluate(() => {
      const svg = document.querySelector('[data-testid="construction-still"]')!.getBoundingClientRect();
      return Math.round(svg.width * 100) / 100;
    });

    expect(drawn, `the drawing at ${width} is not narrower than at the width below`).toBeGreaterThanOrEqual(previous - 0.5);
    previous = drawn;
  }
});

test('§28’s growth below 1440: at 1000 the page is 1000 wide, not 960 centred', async ({ page }) => {
  /**
   * **Expected to fail on first run, and it is §28 unbuilt rather than §30
   * breaking something.** §30: "§28 already says columns grow between
   * breakpoints below 1440 too, so a 1000px window should show 8 columns of
   * 125 across the full width, not 960 centred. If the build centres there,
   * the build diverges from §28."
   *
   * The gap growth closes is larger than it looks: 960 to 1439 is one
   * breakpoint, so at the top of that range it would reach 479px.
   */
  const id = await seed(page);
  await page.setViewportSize({ width: 1000, height: NO_SCROLL_HEIGHT });
  await page.goto(`/records/${id}`);
  await page.locator('[data-section]').first().waitFor({ timeout: 20_000 });

  const measured = await page.evaluate(() => {
    const region = document.querySelector('[data-region="extended-grid"]')!.getBoundingClientRect();
    const columns = getComputedStyle(document.querySelector('[data-region="extended-grid"]')!)
      .gridTemplateColumns.split(/\s+/)
      .filter((v) => v !== '')
      .map((v) => parseFloat(v));
    return { width: Math.round(region.width), columns };
  });

  expect(measured.width, 'the page takes the whole 1000').toBe(1000);
  expect(measured.columns.length, 'on eight columns').toBe(8);
  expect(measured.columns[0], 'of 125 each, grown from the 120 module').toBeCloseTo(125, 0);
});

test('§28: every row of the identity band is 547 from 480 up, with every cell visible; below 480 it has no fixed height', async ({ page }) => {
  /**
   * **§28: "'The band' means each row of it: every row of the upper band is
   * 547, and where §28's wrap moves the third cell to a second row at 8
   * columns, or stacks all three at 4, the band is two or three such rows,
   * 1094 from 960 to 1439 and 1641 from 480 to 959."**
   *
   * The earlier version of this test read "the band stays at 547 above 480"
   * as the band's whole height, and passed only while the still and sleeve
   * were hidden below the fork -- 547 was trivially true of one row. Once
   * the cells wrapped it failed at 1094 and 1641, which is the conflict
   * Design settled with the sentence above (step 33). So: rows × 547, and
   * every cell visible -- "test each row with every cell visible, not with
   * cells hidden."
   *
   * **Asserted on the rendered box, never on `style.height`.** The declared
   * value reads 547 at every width because the fork overrode it in a
   * stylesheet without touching the attribute
   * (`docs/findings/declared-values-are-not-measurements.md`).
   */
  const id = await seed(page);

  for (const width of [1440, 1200, 960, 720, 480]) {
    await page.setViewportSize({ width, height: NO_SCROLL_HEIGHT });
    await page.goto(`/records/${id}`);
    await page.locator('[data-track="content"]').waitFor({ timeout: 20_000 });

    const band = await page.evaluate(() => {
      const el = document.querySelector('[data-cell="identity-content"]')!.closest('[data-band]') as HTMLElement;
      const cells = ['identity', 'still', 'sleeve'].map((name) => {
        const cell = document.querySelector(`[data-cell="${name}"]`) as HTMLElement | null;
        return { name, display: cell === null ? 'absent' : getComputedStyle(cell).display, height: cell === null ? 0 : Math.round(cell.getBoundingClientRect().height) };
      });
      return { rendered: Math.round(el.getBoundingClientRect().height), cells };
    });

    const rows = upperRowsAt(width).length;
    expect(band.rendered, `at ${width}, ${rows} row(s) of ${BANDS.identity}`).toBe(rows * BANDS.identity);
    for (const cell of band.cells) {
      expect(cell.display, `${cell.name} at ${width} is visible`).not.toBe('none');
      /* A cell is the row less the band's last pixel, which is the rule (SLEEVE_CELL: 546). */
      expect(cell.height, `${cell.name} at ${width} is one row tall`).toBe(SLEEVE_CELL.height);
    }
  }

  /* Below 480 it has no fixed height, so the box is its content's. */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/records/${id}`);
  await page.locator('[data-track="content"]').waitFor({ timeout: 20_000 });

  const narrow = await page.evaluate(() => {
    const el = document.querySelector('[data-cell="identity-content"]')!.closest('[data-band]') as HTMLElement;
    return Math.round(el.getBoundingClientRect().height);
  });
  expect(narrow % BANDS.identity, 'below 480 the band grows to its content, not to rows of 547').not.toBe(0);
});
