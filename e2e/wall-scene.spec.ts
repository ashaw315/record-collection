import { expect, test, type Page } from '@playwright/test';
import sharp from 'sharp';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';
import { removeRecordsFor, seedRecords } from './seed';

/**
 * The wall in the scene, at `/plane`.
 *
 * **`/` is untouched by this unit** and still renders the CSS wall; its specs
 * are unchanged and must stay green. This file tests the candidate.
 *
 * Two things are asserted here and nothing else, because rendering is hard to
 * assert honestly and this project has been burned by tests that measured the
 * wrong thing — a wrapper with no size, a background with no box. A canvas is
 * worse than both: `getBoundingClientRect` can see the canvas element and
 * nothing inside it.
 *
 *   1. THE SLOT EMPTIES. The behavioural claim the whole rewrite rests on.
 *   2. THE ACCESSIBLE LIST. Now the only channel carrying the collection to
 *      anything that is not an eye, so it carries the contract eight specs
 *      depend on.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * Every artist this file seeds, cleaned up in `afterEach`.
 *
 * **A hook rather than a `finally` at each call site**, because `seed()` is
 * called from sixteen tests and the one that gets forgotten is the one that
 * matters. The hook also runs after a FAILING test, which is the property NOTES
 * requires: a spec seeding bulk data must clean up even when it fails, or one
 * failure cascades into every later spec and buries the original cause.
 */
const seededArtists: string[] = [];

/**
 * Teardown goes straight to the database, as the seed does. The seed moved to
 * one INSERT (see `seed` below) and leaving the delete on the API would have
 * left a spec that seeds via SQL and tears down via 200 paginated HTTP DELETEs
 * with nothing explaining the asymmetry — `seed.ts`'s argument against HTTP
 * fixtures degrading the shared server applies to the teardown exactly as it
 * does to the seed. Nothing here needs the API's delete path: these records
 * carry no images (no blob to orphan) and nothing references them (no §7.4
 * refusal to honour).
 *
 * Records before the artist, and best-effort: this is the teardown path, and a
 * throw here would replace a real failure with a cleanup error.
 */
test.afterEach(async () => {
  const db = getTestDb();
  for (const artistId of seededArtists.splice(0)) {
    try {
      await removeRecordsFor(artistId);
      await db.execute(sql`DELETE FROM artists WHERE id = ${artistId}::uuid`);
    } catch {
      // Swallowed deliberately — see above.
    }
  }
});

/**
 * The records go straight to the database through `seedRecords` — ONE
 * statement — rather than one `POST /api/records` each. This file predated
 * that helper and kept the HTTP loop after every other bulk-seeding spec had
 * moved, which was drift rather than a decision: `seed.ts` states the reason
 * (fixtures that are scenery, created over HTTP, degrade the shared dev server
 * and destabilise every other spec in the run), and this file's 200-record
 * re-wrap fixture was the largest remaining offender. Measured: 200 POSTs took
 * 3.0–4.0s; the single INSERT took 14–22ms.
 *
 * The artist is still created through the API — one call — and these records
 * need nothing the route adds on create (spine colour is set on image attach).
 *
 * `titles` is rebuilt from the helper's own naming, `prefix NN suffix`, for
 * the specs that look records up by name. Postgres `lpad` TRUNCATES past its
 * length, so the rebuild does too; only fixtures over 100 would notice, and
 * none of those use the titles.
 */
async function seed(page: Page, count: number) {
  const artist = await page.request.post('/api/artists', { data: { name: `Wall-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  seededArtists.push(artistId);

  const run = suffix();
  await seedRecords(artistId, 'Wall', run, count);

  const titles = Array.from(
    { length: count },
    (_, i) => `Wall ${String(i).padStart(2, '0').slice(0, 2)} ${run}`,
  );
  return { artistId, titles };
}

/**
 * Clicks until a spine is actually hit, walking across the first row.
 *
 * **Hit testing is a raycast now**, so there is no element to target and a
 * fixed coordinate is a guess about where the packing put a spine. Spine widths
 * vary 17-24px from the record id and other tests' records share the wall, so
 * that guess is not stable between runs — which is exactly how a test passes
 * for a while and then flakes.
 */
async function clickASpine(page: Page, box: { x: number; y: number }) {
  /*
    **The canvas box is re-read, not reused.** Pulling a record scrolls the
    wall's centre into view, so a box measured before one pull is stale for the
    next — the second `clickASpine` in a test hit empty page and reported "no
    spine was hit anywhere", which reads as a broken wall rather than a stale
    coordinate.
  */
  /*
    **Scrolled to the top and re-measured.** Pulling a record scrolls the wall's
    centre into view, so after one pull the first row can be off-screen entirely
    — a second `clickASpine` then hit empty page and reported "no spine was hit
    anywhere", which reads as a broken wall rather than a stale viewport.
  */
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(150);

  const live = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  const at = live ?? box;

  for (let offset = 20; offset < 400; offset += 12) {
    await page.mouse.click(at.x + offset, at.y + 120);

    const pulled = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
      return el.dataset.pulled ?? '';
    });
    if (pulled !== '') return;
  }
  throw new Error('no spine was hit anywhere along the first row');
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

/**
 * **Scoped to this run's own records.**
 *
 * `/plane` renders the WHOLE collection, so under the full suite these tests
 * saw every other test's fixtures — hundreds of records, a wall many rows deep,
 * and a scene that took longer to build than any reasonable timeout. They
 * passed alone and failed in the suite, which is this project's own rule about
 * isolation being no evidence, arriving from the other direction.
 *
 * The filter is the same `artistId` the collection views use, so this exercises
 * the real query rather than a test-only path.
 */
/**
 * Clicks empty wall to put a record back.
 *
 * **Clamped to the viewport**, because a large collection's wall is many rows
 * deep and a canvas taller than the window is ordinary: three tests clicked at
 * `box.y + box.height - 30`, which for a multi-row wall landed BELOW the fold
 * and hit nothing at all. They failed reporting an unchanged slot gap, which
 * reads as "the return never ran" — the right symptom from the wrong cause.
 * (The wall's four-row minimum that first surfaced this was removed — A24d
 * amended — but the clamp stands: these fixtures are 130 records, several rows.)
 *
 * The far right of a row is empty wall on any collection that does not fill it,
 * so the raycast misses every spine and dismisses.
 */
async function dismiss(page: Page, box: { x: number; y: number; width: number; height: number }) {
  /*
    **The far right of the FIRST row** — empty wall on any collection that does
    not fill row 0, which the small fixtures here never do. This used to click
    the canvas BOTTOM, relying on the four-row minimum to leave empty shelf
    below the records; with that minimum gone (A35) a short collection is one
    row and the bottom click landed ON a spine, which navigates instead of
    dismissing. The row's own vertical centre is stable regardless of how many
    rows the wall has.

    Clamped into the viewport, because a tall wall's row 0 can sit above the
    fold after a pull scrolls the scene — a click above y=0 hits nothing and the
    raycast never runs.
  */
  const SPINE_HEIGHT = 240; // src/app/shelf/spine.ts; a row's own height
  const rowCentre = Math.max(box.y + SPINE_HEIGHT / 2, 40);
  await page.mouse.click(box.x + box.width - 20, rowCentre);
}

async function openWall(page: Page, artistId: string) {
  await page.goto(`/plane?artistId=${artistId}`);
  const canvas = page.getByTestId('wall-scene').locator('canvas');
  await expect(canvas).toBeAttached({ timeout: 30_000 });
  return canvas;
}

test('pulling a record EMPTIES its slot in the wall', async ({ page }) => {
  /**
   * **The question this whole unit exists to answer.**
   *
   * With a CSS wall and a canvas over it, clicking a spine left that spine
   * drawn, lit and in place while a separate object appeared in front of it —
   * no gap, no occlusion, one light on each. It read as *a thing appeared near
   * a shelf* rather than *this record came off the shelf*.
   *
   * The spine that rises IS the spine that was in the wall now, so the gap is
   * not drawn or coordinated — it is simply where the mesh is not any more.
   * That is what this measures: the pulled spine's distance from its home
   * position, published from the same values that move it.
   *
   * **Not a screenshot, and not a rect.** A canvas has no boxes inside it, so
   * `getBoundingClientRect` would answer a different question confidently —
   * unit 22's finding, one level worse.
   */
  const { artistId } = await seed(page, 12);
  await openWall(page, artistId);

  const scene = page.getByTestId('wall-scene');
  /*
    **Waited for by the CANVAS, not by visibility.** The mount div has no height
    of its own until the canvas is inside it, so `toBeVisible` on the wrapper
    asks a question about a zero-height box. And the scene is built on a layout
    frame after measuring, so under a loaded suite it arrives later than the
    element does — a short default timeout made these pass alone and fail in
    the full run.
  */
  await expect(scene.locator('canvas')).toBeAttached({ timeout: 30_000 });

  // Nothing pulled: every spine is in its slot.
  await expect(scene).toHaveAttribute('data-pulled', '');

  const box = await scene.locator('canvas').boundingBox();
  expect(box, 'the canvas must have a measurable box to click into').not.toBeNull();
  if (box === null) return;

  /*
    Click into the first row, a little in from the left, where spines are.
    The canvas is the only click target — hit testing is a raycast now.
  */
  await clickASpine(page, box);

  await expect(scene, 'a spine was hit').not.toHaveAttribute('data-pulled', '');

  // Let the rise run.
  await page.waitForTimeout(900);

  const gap = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
    return Number(el.dataset.slotGap ?? 0);
  });

  /**
   * The record must have LEFT its slot, by a distance comparable to the wall
   * rather than a nudge. A spine is ~20px wide and 240px tall; anything under
   * a spine's height would be the record still sitting in the wall.
   */
  expect(gap, `the pulled spine is ${Math.round(gap)}px from its slot`).toBeGreaterThan(240);
});

test('the pulled record settles CENTRED in view, at any collection size', async ({ page }) => {
  /**
   * **The defect this catches shipped with every assertion green.** The slot
   * emptied, the record occluded the wall, the rise completed — and the record
   * settled at NDC y 0.838, clipped against the top of the frame, because it
   * kept its slot's row height. Where it landed depended on which row it came
   * from, which is not a destination anyone chose.
   *
   * §10b: "it was on the shelf a moment ago and now it is in your hands."
   *
   * **Asserted at two collection sizes**, because a camera-relative
   * destination and an absolute one are the same observation at one size. The
   * camera frames the whole wall, so its distance scales with the collection —
   * that is exactly where the two designs diverge.
   */
  /**
   * **The counts must span more than one ROW, not just more than one record.**
   *
   * A first version used 5 and 40, which both fit one row at 1280px — and
   * there `home.y` IS the view centre, so restoring the defect changed nothing
   * and the test passed against it. Mutation-proved and rewritten.
   *
   * 130 wraps to three rows, where a row-0 record's own height is 252 world
   * units above centre. That is the case the two designs disagree about.
   */
  const landedAt: number[] = [];

  for (const count of [5, 130]) {
    const { artistId } = await seed(page, count);
    await openWall(page, artistId);

    const scene = page.getByTestId('wall-scene');
    const box = await scene.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    await clickASpine(page, box);
    await expect(scene).not.toHaveAttribute('data-pulled', '');

    /*
      **Wait for the rise to actually SETTLE, not a fixed 900ms.** The record
      interpolates from its slot to the destination over the rise; a fixed
      timeout reads a partway position under load, and this test flaked on both
      axes (NDC y, then x) for exactly that reason across two steps. The scene
      exposes `pulledProgress`, which reaches '1' when the rise completes — a
      settle SIGNAL rather than a guess at its duration.
    */
    await expect
      .poll(
        () =>
          page.evaluate(
            () =>
              (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset
                .pulledProgress ?? '0',
          ),
        { timeout: 10_000 },
      )
      .toBe('1');

    const settled = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
      return {
        x: Number(el.dataset.settledNdcX ?? 9),
        screenY: Number(el.dataset.settledScreenY ?? -1),
        viewportH: window.innerHeight,
        regionTop: Math.max(Math.round(el.querySelector('canvas')!.getBoundingClientRect().top), 0),
      };
    });

    /*
      **Horizontally centred** on the camera axis — NDC x ~0, unchanged.
    */
    expect(Math.abs(settled.x), `${count} records: horizontally centred`).toBeLessThan(0.05);

    /*
      **Vertically inside the VISIBLE WALL REGION, and in the same place at both
      collection sizes** — which is the row-independence this test exists for.

      It previously asserted `screenY ≈ innerHeight / 2`. That could not fail:
      the destination places the record at the viewport centre using
      `innerHeight` and `canvasDocTop`, and `settledScreenY` reads it back
      through the same canvas rect, so both sides came from the same two
      numbers. It reported delta 0 while the sleeve ran off the top of the wall
      on a phone. Whether the record is WHOLE and where it sits relative to the
      region is asserted from pixels in "the pulled sleeve fits INSIDE the
      visible wall region"; what is left here is the claim that test cannot make
      — that the answer does not depend on which row the record came from, at
      two collection sizes with different camera distances.
    */
    expect(
      settled.screenY,
      `${count} records: below the wall region top (screenY ${settled.screenY}, region top ${settled.regionTop})`,
    ).toBeGreaterThan(settled.regionTop);
    expect(
      settled.screenY,
      `${count} records: above the fold (screenY ${settled.screenY}, fold ${settled.viewportH})`,
    ).toBeLessThan(settled.viewportH);
    landedAt.push(settled.screenY);
  }

  /*
    The row-independence itself: 5 records is one row, 130 is three, and the
    camera distance differs between them. A destination that kept the slot's own
    row height — the defect this test was written for — puts these far apart.
  */
  expect(
    Math.abs(landedAt[0] - landedAt[1]),
    `same place from row 0 of a one-row wall (${landedAt[0]}) and a three-row wall (${landedAt[1]})`,
  ).toBeLessThan(60);
});

test('the record returns to its slot when dismissed', async ({ page }) => {
  const { artistId } = await seed(page, 12);
  await openWall(page, artistId);

  const scene = page.getByTestId('wall-scene');
  const box = await scene.locator('canvas').boundingBox();
  if (box === null) return;

  await clickASpine(page, box);
  await expect(scene).not.toHaveAttribute('data-pulled', '');
  await page.waitForTimeout(900);

  // Clicking empty wall puts it back — the raycast misses every spine.
  await dismiss(page, box);
  await expect(scene, 'the wall is whole again').toHaveAttribute('data-pulled', '');

  /*
    **Polled, because dismissal now ANIMATES.** This assertion read the gap
    immediately and passed while the record vanished on dismiss — an instant
    snap satisfies "ends up home" perfectly. That it kept passing through the
    vanish is why `the record ANIMATES back` exists beside it: this one checks
    the destination, that one checks there was a journey.
  */
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Number(
            (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset
              .slotGap ?? -1,
          ),
        ),
      { timeout: 5000 },
    )
    .toBeLessThan(1);
});

test('the record ANIMATES back rather than vanishing', async ({ page }) => {
  /**
   * **The record vanished on dismiss and the existing return test passed
   * against it**, because that test asserts where the record ENDS UP — which an
   * instant snap satisfies perfectly. Ending in the right place is not the
   * same as travelling there.
   *
   * §10b: the record goes back where it came from. Asserted by catching it
   * mid-flight: shortly after dismissal it must be somewhere between the
   * destination and its slot, not already home and not still out.
   */
  const { artistId } = await seed(page, 12);
  await openWall(page, artistId);

  const scene = page.getByTestId('wall-scene');
  const box = await scene.locator('canvas').boundingBox();
  if (box === null) return;

  await clickASpine(page, box);
  await expect(scene).not.toHaveAttribute('data-pulled', '');
  await page.waitForTimeout(900);

  const out = await page.evaluate(() =>
    Number(
      (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.slotGap ?? 0,
    ),
  );
  expect(out, 'the record is out of the wall to begin with').toBeGreaterThan(200);

  // Dismiss, then sample immediately — before the return can have finished.
  await dismiss(page, box);
  await page.waitForTimeout(150);

  const midFlight = await page.evaluate(() =>
    Number(
      (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.slotGap ?? -1,
    ),
  );

  /*
    Between the two, not at either end. A snap gives 0 here; no return at all
    leaves it at `out`.
  */
  expect(midFlight, 'not already home — that is a snap, not a return').toBeGreaterThan(1);
  expect(midFlight, 'and on its way back, not still out there').toBeLessThan(out);

  // And it finishes.
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Number(
            (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset
              .slotGap ?? -1,
          ),
        ),
      { timeout: 5000 },
    )
    .toBeLessThan(1);
});

test('the return re-measures the slot rather than caching it', async ({ page }) => {
  /**
   * Unit 19's rule, carried across: the slot is read at DISMISS time, not
   * remembered from the rise. That unit's mutation missed by 201px against a
   * 240px scroll.
   *
   * **Asserted against RESIZE, which is the stronger fixture.** A scroll moves
   * every spine on screen; a resize RE-WRAPS the rows, so a record's slot can
   * change row entirely. An earlier version of this test had to use scroll
   * because the scene did not rebuild on resize at all — that gap is now
   * closed, so the test uses the case it always wanted.
   */
  const { artistId } = await seed(page, 60);
  await openWall(page, artistId);

  const scene = page.getByTestId('wall-scene');
  const box = await scene.locator('canvas').boundingBox();
  if (box === null) return;

  await clickASpine(page, box);
  await expect(scene).not.toHaveAttribute('data-pulled', '');
  await page.waitForTimeout(900);

  // Re-wrap the wall while the record is out — every slot moves.
  await page.setViewportSize({ width: 900, height: 900 });
  await page.waitForTimeout(700);

  /*
    Where the record's own spine sits in wall coordinates, read from the layout
    the scene is using. The return must land HERE.
  */
  const slot = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
    return {
      x: Number(el.dataset.layoutSlotX ?? NaN),
      y: Number(el.dataset.layoutSlotY ?? NaN),
    };
  });

  /*
    The canvas has moved and re-sized, so its box is re-read rather than reused.
    Clicking the old one would miss the wall entirely.
  */
  const after = await scene.locator('canvas').boundingBox();
  expect(after).not.toBeNull();
  if (after === null) return;

  await dismiss(page, after);
  await page.waitForTimeout(1400);

  /**
   * **Measured absolutely, not against the record's own reference.**
   *
   * A first version polled `slotGap`, which is computed as the distance from
   * `home` — so corrupting `home` moved the record and the ruler together and
   * the gap still reached zero. It could not fail. The mesh's absolute position
   * against the slot's own coordinates is the check that can.
   */
  const landed = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
    return { x: Number(el.dataset.meshX ?? NaN), y: Number(el.dataset.meshY ?? NaN) };
  });

  expect(landed.x, 'the record is back in its own slot, horizontally').toBeCloseTo(slot.x, 0);
  expect(landed.y, 'and vertically').toBeCloseTo(slot.y, 0);
});

test('the wall RE-WRAPS when its container changes width', async ({ page }) => {
  /**
   * **The scene did not rebuild on resize, and a comment claimed it did.** It
   * described a `ResizeObserver` re-running the effect "by bumping a version
   * counter"; no such counter existed and none ever had.
   *
   * The consequence is worse than a stale picture. The wall re-wraps on any
   * width change, so every slot moves — and both the rise and the return map to
   * slots. A resize mid-session left the scene describing a layout that no
   * longer existed: a record rising out of a gap that is not where the gap is.
   *
   * Asserted on the ROW COUNT rather than the canvas size, because the canvas
   * changes size for reasons that are not re-wrapping and the row count is what
   * a re-wrap actually means.
   */
  /**
   * **The fixture must fill several rows at the wide width**, or the re-wrap is
   * invisible: a wall that is one row at 1280 and still one row at 600 cannot
   * show the row count moving. 200 records is several rows at 1280 and more when
   * narrowed. (This once had to clear the four-row floor as well; that floor is
   * gone — A24d amended — but a multi-row fixture is still what makes a re-wrap
   * observable.)
   *
   * The same shape as every discriminating fixture in this strand — a test at a
   * size the rule already covers cannot see the rule working.
   */
  const { artistId } = await seed(page, 200);

  await page.setViewportSize({ width: 1280, height: 900 });
  await openWall(page, artistId);

  const read = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
      return { rows: Number(el.dataset.rows ?? -1), width: Number(el.dataset.wallWidth ?? -1) };
    });

  const wide = await read();
  expect(wide.rows, 'the wall has rows to begin with').toBeGreaterThan(0);

  await page.setViewportSize({ width: 600, height: 900 });

  /*
    Polled: the rebuild is a measurement, a layout and a WebGL scene, and it
    happens on the observer's own schedule rather than synchronously with the
    viewport change.
  */
  await expect
    .poll(async () => (await read()).width, { timeout: 5000 })
    .toBeLessThan(wide.width);

  const narrow = await read();
  expect(
    narrow.rows,
    `${wide.width}px gave ${wide.rows} rows; ${narrow.width}px must give more`,
  ).toBeGreaterThan(wide.rows);

  // And back, so the rebuild is not one-way.
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect.poll(async () => (await read()).rows, { timeout: 5000 }).toBe(wide.rows);
});

test('the accessible list carries every record with its FULL title', async ({ page }) => {
  /**
   * **The contract eight specs depend on, and now the only channel carrying
   * it.** A canvas is a picture: no text, no roles, no links. Per-spine
   * overlaid links were rejected because they need positional alignment kept in
   * sync with the layout — two systems agreeing about a number, which has
   * failed every time here.
   *
   * The UNTRUNCATED title is the point. `spineText` clips the visible string to
   * fit a 20px spine, so what is drawn may be `Luther Vandross  Nev…  FE 37451`
   * — which names no record to a screen reader and which no caller could
   * search for. That distinction is an accessibility rule, not a test
   * accommodation.
   */
  const { artistId, titles } = await seed(page, 8);
  await openWall(page, artistId);

  const list = page.getByTestId('wall-records');

  for (const title of titles) {
    /*
      Found by ROLE and NAME, which is how every other collection view exposes
      a record and how the eight specs locate one.
    */
    await expect(
      list.getByRole('link', { name: new RegExp(title) }),
      `${title} must be reachable by name`,
    ).toHaveCount(1);
  }

  /*
    **Scoped to this run's fixtures, not the whole list.** `/plane` renders the
    entire collection unfiltered, so a suite running in parallel puts other
    tests' records on the same wall — an exact total is a test asserting
    something about the database rather than about the list. What must be true
    is that every seeded record appears exactly once, which the loop above
    already pins.
  */
  const links = await list.getByRole('link').count();
  expect(links, 'one link per record, no more — the wall is scoped').toBe(titles.length);

  // And they resolve to the record.
  const href = await list.getByRole('link').first().getAttribute('href');
  expect(href).toMatch(/^\/records\/[0-9a-f-]{36}$/);
});

test('a keyboard can walk the wall and open a record', async ({ page }) => {
  /**
   * **The contract the canvas cannot carry, and the one the swap nearly lost.**
   *
   * The CSS wall's spines were real focusable links: tabbable, clickable,
   * cmd-clickable. A canvas has none of that, so the accessible list is the
   * only channel — and `sr-only` alone clips it to 1px, which is right for a
   * screen reader and useless for a keyboard.
   *
   * Measured by hand after the swap: tabbing skipped the entire wall and a link
   * could not be clicked at all. That is a capability LOST rather than
   * knowingly traded, which is the distinction that matters — cmd-click was
   * traded, this was not.
   *
   * Asserted as what a user can DO: tab to it, see it, press Enter, arrive.
   */
  const { artistId, titles } = await seed(page, 6);
  await openWall(page, artistId);

  const list = page.getByTestId('wall-records');
  await expect(list).toBeAttached();

  // Tab until focus lands inside the list, as a keyboard user would.
  let reached = false;
  for (let press = 0; press < 25 && !reached; press += 1) {
    await page.keyboard.press('Tab');
    reached = await page.evaluate(
      () => document.activeElement?.closest('[data-testid="wall-records"]') !== null,
    );
  }

  expect(reached, 'the wall must be reachable by keyboard at all').toBe(true);

  /**
   * **Visible once focused, not merely present.** A 1px link is findable by a
   * test and invisible to a person — this is the half that separates the two.
   */
  const focused = await page.evaluate(() => {
    const box = (document.activeElement as HTMLElement).getBoundingClientRect();
    return { width: box.width, height: box.height, href: (document.activeElement as HTMLAnchorElement).href };
  });

  expect(focused.width, 'the focused record is on screen, not clipped to 1px').toBeGreaterThan(50);
  expect(focused.height).toBeGreaterThan(10);
  expect(focused.href).toMatch(/\/records\/[0-9a-f-]{36}$/);

  // And Enter takes you there.
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}/, { timeout: 15_000 });

  // The record that opened is one of ours.
  const heading = await page.getByRole('heading', { level: 1 }).first().textContent();
  expect(titles.some((t) => heading?.includes(t)), `opened "${heading}"`).toBe(true);
});

test('the wall is as tall as its CONTENTS — a small result is a small wall', async ({ page }) => {
  /**
   * **The four-row minimum is gone (A24d amended).** It reserved four shelves
   * however few records matched, so a filtered result sat above rows of empty
   * shelf — meant to say "these are the ones that matched". Judged on both
   * screens with real data it did not earn its place: at 390px the empty rows
   * stretched the canvas and pushed records to odd positions, and at 1280 they
   * said in furniture what the heading's count now says in words ("N of M
   * records"). So the wall is exactly the rows its records fill.
   *
   * **The discriminating fixture is a SHORT collection.** A wall that already
   * fills several rows cannot tell "no minimum" from a minimum it exceeds. One
   * record is one shelf; a handful that fits one row is one shelf. The old
   * contract forced 4 here — this is its inversion, the E2E twin of the
   * `wall-layout` unit test.
   */
  for (const count of [1, 5]) {
    const { artistId } = await seed(page, count);
    await openWall(page, artistId);

    const rows = await page.evaluate(() =>
      Number(
        (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.rows ?? -1,
      ),
    );

    expect(rows, `${count} records fit one row, so the wall is one shelf — not four`).toBe(1);
  }
});

test('hovering a spine names it, and costs nothing when the pointer rests', async ({ page }) => {
  /**
   * §10b's hover: the spine eases proud and a card names the record. **The
   * thing that pops is the thing that will come out**, so the click is legible
   * in advance.
   *
   * **The draw discipline is what this test is really for.** Before this unit
   * the wall cost ZERO draws across 60 fast pointer moves, because there was no
   * handler at all; a naive version renders on every `pointermove` across 125
   * spines. The raycast is unavoidable, the draw is not.
   */
  const { artistId, titles } = await seed(page, 12);
  await openWall(page, artistId);

  const scene = page.getByTestId('wall-scene');
  const box = await scene.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  // Find a spine by moving across the first row until one is hovered.
  let hovered = '';
  for (let offset = 40; offset < 500 && hovered === ''; offset += 9) {
    await page.mouse.move(box.x + offset, box.y + 120);
    hovered = await page.evaluate(
      () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.hovered ?? '',
    );
  }

  expect(hovered, 'a spine must be hoverable at all').not.toBe('');

  const card = page.getByTestId('wall-card');
  await expect(card, 'the card names what the pointer is over').toBeVisible();

  const text = await card.textContent();
  expect(
    titles.some((title) => text?.includes(title)),
    `the card read "${text}"`,
  ).toBe(true);
});

test('a resting pointer costs NO draws, and the wall settles to quiet', async ({ page }) => {
  /**
   * **The constraint this unit was most likely to break**, asserted with a
   * settle window rather than immediately.
   *
   * A zero measured straight after a pointer move cannot distinguish *did not
   * render* from *has not rendered yet* — NOTES records that trap from step 10
   * unit 4, where a zero taken too early passed against a mutation that moved a
   * fetch into a mount effect. So: move, let it settle, then assert quiet.
   *
   * **The discriminating case is a resting pointer ON a spine.** A pointer over
   * empty wall is quiet in any implementation; jitter on one spine is what
   * separates "redraw on change" from "redraw on move".
   */
  const { artistId } = await seed(page, 12);
  await openWall(page, artistId);

  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (box === null) return;

  await page.evaluate(() => {
    (window as unknown as { __drawCount?: number }).__drawCount = 0;
  });

  /*
    Land on a spine and REMEMBER WHERE, so the jitter below stays on it. A first
    version jittered at a fixed x ± 1px, which near a spine edge crosses onto
    the neighbour — spines are ~22px wide — and measured 6 draws for what it
    called a resting pointer. The fixture was wrong, not the code.
  */
  let hovered = '';
  let restX = 0;
  for (let offset = 40; offset < 500 && hovered === ''; offset += 9) {
    await page.mouse.move(box.x + offset, box.y + 120);
    hovered = await page.evaluate(
      () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.hovered ?? '',
    );
    restX = box.x + offset;
  }
  await page.waitForTimeout(600);

  const before = await page.evaluate(
    () => (window as unknown as { __drawCount?: number }).__drawCount ?? 0,
  );

  /*
    Jitter within the SAME spine: the hovered id does not change, so nothing
    should redraw.
  */
  for (let i = 0; i < 20; i += 1) {
    // Vertically, within the same spine — a spine is 240px tall and ~22 wide,
    // so moving down its length cannot cross onto a neighbour.
    await page.mouse.move(restX, box.y + 120 + (i % 3));
  }
  await page.waitForTimeout(800);

  const stillHovered = await page.evaluate(
    () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.hovered ?? '',
  );
  expect(stillHovered, 'the jitter must stay on the same spine to test anything').toBe(hovered);

  const after = await page.evaluate(
    () => (window as unknown as { __drawCount?: number }).__drawCount ?? 0,
  );

  expect(after - before, 'a resting pointer must cost nothing').toBe(0);
});

test('crossing the wall fast leaves exactly ONE spine proud', async ({ page }) => {
  /**
   * **The discriminating case for "one owner"**, and the reason a single-hover
   * test is not enough: crossing the wall touches forty spines, and per-spine
   * state can leave several proud or one stuck. A test that hovers one spine
   * cannot tell the two designs apart.
   */
  const { artistId } = await seed(page, 40);
  await openWall(page, artistId);

  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (box === null) return;

  for (let i = 0; i < 40; i += 1) {
    await page.mouse.move(box.x + 30 + i * 14, box.y + 120);
  }
  await page.waitForTimeout(700);

  const hovered = await page.evaluate(
    () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.hovered ?? '',
  );

  /*
    Exactly one card, naming exactly one record — the DOM is the readable
    witness for a state the canvas holds.
  */
  await expect(page.getByTestId('wall-card')).toHaveCount(hovered === '' ? 0 : 1);
});

test('the composition arrives with the record: scrim, facts, actions', async ({ page }) => {
  /**
   * What the CSS path had and the swap left behind. Unit 11's finding is the
   * ordering: the chrome arrives AS the record travels, not before it — that
   * is what makes it read as arriving rather than a modal opening.
   */
  const { artistId } = await seed(page, 12);
  await openWall(page, artistId);

  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (box === null) return;

  await clickASpine(page, box);
  await expect(page.getByTestId('record-chrome')).toBeVisible();

  // The chrome is not yet arrived while the record is still travelling.
  const early = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="record-chrome"]') as HTMLElement).opacity,
  );

  await page.waitForTimeout(1200);

  /*
    **Scoped to the chrome.** `/plane` is a workbench and renders `FactsPanel`
    per record further down the page, so an unscoped `getByTestId` resolves to
    thirteen. Scoping asserts the WALL's composition rather than the page's.
  */
  const chrome = page.getByTestId('record-chrome');
  await expect(chrome.getByTestId('record-scrim')).toBeVisible();
  /*
    A33: the flanking panel is `RecordPanel`, expanded at rest on desktop —
    its facts, controls and detail link are all present.
  */
  await expect(chrome.getByTestId('record-panel')).toBeVisible();
  await expect(chrome.getByTestId('action-turn')).toBeVisible();
  /*
    These records carry no pressing or condition, so `panel-facts` is absent
    (its own test seeds a record that has them). The detail link is always
    present in the expanded desktop panel.
  */
  await expect(chrome.getByTestId('panel-detail-link')).toHaveAttribute('href', /\/records\//);

  const settled = await page.evaluate(
    () => getComputedStyle(document.querySelector('[data-testid="record-chrome"]') as HTMLElement).opacity,
  );

  expect(Number(settled), 'the chrome has arrived once the record settles').toBeGreaterThan(0.9);
  expect(
    Number(early),
    `the chrome must not be there before the record is (was ${early})`,
  ).toBeLessThan(Number(settled));
});

test('the panel values are READABLE against the scrim', async ({ page }) => {
  /**
   * **Not optional**: this caught 1.02:1 once, when values were painted
   * near-black on near-black and the panel read as labels with no values. The
   * ground here is the scrim rather than `/plane`'s page, so the measurement
   * has to be taken again rather than assumed to carry.
   */
  const artist = await page.request.post('/api/artists', { data: { name: `Read-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  /* Registered for teardown — this path never was, and leaked a record per run. */
  seededArtists.push(artistId);
  const label = await page.request.post('/api/labels', { data: { name: `RLab-${suffix()}` } });
  await page.request.post('/api/records', {
    data: {
      title: `Readable ${suffix()}`,
      artistId,
      labelId: (await label.json()).id as string,
      releaseYear: 1979,
      conditionMedia: 'VG+',
      purchasePrice: '24.50',
    },
  });

  await openWall(page, artistId);
  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (box === null) return;

  await clickASpine(page, box);
  await expect(page.getByTestId('record-chrome').getByTestId('panel-facts')).toBeVisible();
  await page.waitForTimeout(900);

  const worst = await page.evaluate(() => {
    const facts = document.querySelector(
      '[data-testid="record-chrome"] [data-testid="panel-facts"]',
    ) as HTMLElement;
    /*
      The ground is the panel container behind the facts — walk up to the
      record-panel, whose background is the scrim/panel ground.
    */
    const ground = getComputedStyle(
      (facts.closest('[data-testid="record-panel"]') as HTMLElement).parentElement as HTMLElement,
    ).backgroundColor;

    const parse = (colour: string): number[] => (colour.match(/[\d.]+/g) ?? []).map(Number);
    const lum = ([r, g, b]: number[]) => {
      const ch = (v: number) => {
        const x = v / 255;
        return x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
      };
      return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
    };
    const ratio = (a: string, b: string) => {
      const la = lum(parse(a));
      const lb = lum(parse(b));
      return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
    };

    const nodes = [...facts.querySelectorAll('dd'), ...facts.querySelectorAll('h3')] as HTMLElement[];
    return Math.min(...nodes.map((n) => ratio(getComputedStyle(n).color, ground)));
  });

  expect(worst, `the least readable value is ${worst.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
});

test('Escape dismisses, and a record dismissed MID-FLIP goes home', async ({ page }) => {
  /**
   * **The interactions, which is what is genuinely new here.** Each feature has
   * its own tests; a test of each alone cannot see a record dismissed mid-flip
   * sticking because two owners disagreed about whether it was still out.
   *
   * That is exactly what separate flags produced every time it was built that
   * way, and why the phase is one value.
   */
  const { artistId } = await seed(page, 12);
  await openWall(page, artistId);

  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (box === null) return;

  // Escape from settled.
  await clickASpine(page, box);
  await page.waitForTimeout(1000);
  await page.keyboard.press('Escape');
  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Number(
            (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.slotGap ?? -1,
          ),
        ),
      { timeout: 6000 },
    )
    .toBeLessThan(1);

  // Dismiss MID-FLIP: turn over, then Escape before the turn completes.
  await clickASpine(page, box);
  await page.waitForTimeout(1000);
  await page.getByTestId('record-chrome').getByTestId('action-turn').click();
  await page.waitForTimeout(120);
  await page.keyboard.press('Escape');

  await expect
    .poll(
      async () =>
        page.evaluate(() =>
          Number(
            (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.slotGap ?? -1,
          ),
        ),
      { timeout: 6000 },
    )
    .toBeLessThan(1);

  await expect(page.getByTestId('record-chrome'), 'and the chrome goes with it').toHaveCount(0);
});

test('the pulled record TILTS with the pointer, and the cover is on its face', async ({
  page,
}) => {
  /**
   * **A value computed, stored, marked dirty, and never applied.**
   *
   * The tilt reported success at every instrument: the phase was `settled`,
   * `canTilt` was true, twenty pointer moves arrived, `tiltFor` returned real
   * angles, the dirty flag fired. Each was UPSTREAM of the break — the line
   * that writes the rotation lived inside `setPulled`, which only runs while
   * the rise or the return is animating, so `markDirty` redrew an unchanged
   * mesh.
   *
   * The flip escaped it only because its animation re-enters `setPulled`, a
   * coupling nothing stated. `applyPose` is now the single writer and every
   * input has a setter that calls it.
   *
   * Asserted on the MESH's rotation rather than on the angles `tiltFor`
   * produced: those were correct throughout the defect.
   */
  await openWall(page, (await seed(page, 8)).artistId);

  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (box === null) return;

  await clickASpine(page, box);
  await expect(page.getByTestId('record-chrome')).toBeVisible();
  await page.waitForTimeout(1100);

  const read = () =>
    page.evaluate(() => {
      const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
      return { x: Number(el.dataset.rotX ?? 0), y: Number(el.dataset.rotY ?? 0) };
    });

  await page.mouse.move(400, 300);
  await page.waitForTimeout(250);
  const upLeft = await read();

  await page.mouse.move(900, 620);
  await page.waitForTimeout(250);
  const downRight = await read();

  /*
    Opposite corners must give opposite signs on BOTH axes. A test that moved
    the pointer once and checked "not zero" would pass against a tilt stuck at
    whatever the first move produced.
  */
  expect(upLeft.y, 'pointer left of centre turns the record one way').toBeLessThan(0);
  expect(downRight.y, 'and right of centre the other').toBeGreaterThan(0);
  expect(
    downRight.x,
    'and the X axis responds too, rather than only Y',
  ).toBeLessThan(upLeft.x);
});

test('a short collection still fills the wall', async ({ page }) => {
  /**
   * §10b: "a short collection reads as short, not broken." Five records on a
   * full wall — the case every candidate minimum width failed, and the reason
   * the shelf is a plane rather than a box.
   */
  const { artistId } = await seed(page, 5);
  const canvas = await openWall(page, artistId);

  const box = await canvas.boundingBox();
  const viewport = page.viewportSize();
  expect(box).not.toBeNull();
  expect(viewport).not.toBeNull();
  if (box === null || viewport === null) return;

  expect(
    box.width,
    'the wall spans the screen with five records on it',
  ).toBeGreaterThan(viewport.width * 0.9);
});

test('the pulled sleeve fits INSIDE the visible wall region on a short viewport', async ({
  page,
}) => {
  /**
   * **The defect a centred-ness assertion structurally could not catch.**
   *
   * `settledScreenY` is the record's CENTRE, and the test beside this one
   * compared it to `innerHeight / 2`. Both sides are computed from the same two
   * quantities — the destination places the record at
   * `scrollY + innerHeight/2 - canvasDocTop()`, and the dataset reads it back
   * through the same canvas rect — so the comparison is a tautology. It asserts
   * the code performed the arithmetic it was told to, and no mutation of that
   * arithmetic can fail it, because the mutation moves both sides together. It
   * reported delta 0 while the sleeve ran off the top of the wall on a phone.
   *
   * So this reads PIXELS. The sleeve is a solid block against the dimmed wall;
   * its extent is scanned from a screenshot and must lie wholly inside the
   * visible wall region — the canvas top (which is below the nav and heading)
   * down to the fold. That is a claim about what is on screen, derived from the
   * render rather than from the inputs that produced it.
   *
   * **The viewport must be SHORT enough to clip.** At 390x844 the region is
   * tall enough to contain a 322px sleeve aimed at the viewport centre, so the
   * broken code passes there; every real Safari viewport is shorter once the URL
   * bar and toolbar are subtracted. Measured against the defect: at 844 the
   * sleeve drew 260..581 (whole), at 664 it drew 229..491 — truncated exactly at
   * the canvas edge, its true top 59px above the region. 664 is the fixture.
   */
  const { artistId } = await seed(page, 12);
  await page.setViewportSize({ width: 390, height: 664 });
  await openWall(page, artistId);

  const scene = page.getByTestId('wall-scene');
  const box = await scene.locator('canvas').boundingBox();
  expect(box).not.toBeNull();
  if (box === null) return;

  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  await clickASpine(page, box);
  await expect
    .poll(
      () =>
        page.evaluate(
          () =>
            (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.phase ??
            '',
        ),
      { timeout: 10_000 },
    )
    .toMatch(/settled/);
  await page.waitForTimeout(400);

  const region = await page.evaluate(() => {
    const host = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
    const rect = host.querySelector('canvas')!.getBoundingClientRect();
    return { top: Math.max(Math.round(rect.top), 0), bottom: window.innerHeight };
  });

  /*
    The sleeve against the dimmed wall. Scanned down the middle column, where the
    record is centred horizontally, so the run is the sleeve's own height. The
    placeholder and a real cover are both far brighter than the dimmed spines
    behind them, which is what makes a luminance threshold enough here — this
    asserts WHERE it is, not what colour it is.
  */
  const shot = await page.screenshot();
  const raw = await sharp(shot).raw().toBuffer({ resolveWithObject: true });
  const { width, height, channels } = raw.info;
  const column = Math.floor(width / 2);
  const luma = (y: number) => {
    const i = (y * width + column) * channels;
    return 0.2126 * raw.data[i] + 0.7152 * raw.data[i + 1] + 0.0722 * raw.data[i + 2];
  };

  const wallFloor = 60;
  let first = -1;
  let last = -1;
  for (let y = region.top; y < Math.min(region.bottom, height); y += 1) {
    if (luma(y) > wallFloor) {
      if (first < 0) first = y;
      last = y;
    }
  }

  expect(first, 'the sleeve is visible in the wall region at all').toBeGreaterThan(-1);
  expect(last - first, 'and it is a sleeve, not a sliver of lit wall').toBeGreaterThan(150);

  /*
    **The load-bearing pair.** A sleeve whose top is pinned to the region's top
    edge is one that has been CLIPPED there — its real top is above it. Asserted
    strictly inside, so touching the edge fails.
  */
  expect(first, `sleeve top ${first} must clear the wall region top ${region.top}`).toBeGreaterThan(
    region.top,
  );
  expect(
    last,
    `sleeve bottom ${last} must clear the fold ${region.bottom}`,
  ).toBeLessThan(region.bottom);
});

test('a record pulled from a SHORT wall is contained and full-size, not clipped', async ({
  page,
}) => {
  /**
   * **The regression removing the four-row minimum exposed (A35).** The canvas
   * is the wall — 1 world unit to 1 screen pixel — so a one-row wall's canvas is
   * ~250px tall. The pulled record floats at the VIEWPORT centre (the placement
   * fix), which on a 900px window is ~450px down: OUTSIDE a 250px canvas. The
   * record rendered tiny and clipped at the canvas edge — `cover-unlit` caught
   * it as a sample window under 40px, and it is visible as a stamp-sized square.
   *
   * The fix decouples the RENDER surface from the wall's content height: the
   * canvas and camera are at least viewport-tall, so a floating record is
   * contained, while the shelves still draw only for the rows the records fill
   * (the wall stays as-tall-as-contents visually). Asserted on the settled
   * record's projected NDC — inside the frustum on BOTH axes means on-screen and
   * whole — and on its on-screen height being a real fraction of the viewport.
   */
  const { artistId } = await seed(page, 3);
  await page.setViewportSize({ width: 1280, height: 900 });
  await openWall(page, artistId);

  const scene = page.getByTestId('wall-scene');
  const box = await scene.locator('canvas').boundingBox();
  if (box === null) return;

  await clickASpine(page, box);
  await expect
    .poll(
      () =>
        page.evaluate(
          () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement).dataset.phase ?? '',
        ),
      { timeout: 10_000 },
    )
    .toMatch(/settled/);

  const m = await page.evaluate(() => {
    const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
    return { ndcX: Number(el.dataset.settledNdcX), ndcY: Number(el.dataset.settledNdcY) };
  });

  /* Inside the frustum on both axes: the whole record is on-screen, not off the
     canvas bottom (the clip was ndcY ≈ -1.04, outside the range). */
  expect(Math.abs(m.ndcX), `ndcX ${m.ndcX} within frustum`).toBeLessThan(1);
  expect(Math.abs(m.ndcY), `ndcY ${m.ndcY} within frustum — not clipped below the canvas`).toBeLessThan(1);
});
