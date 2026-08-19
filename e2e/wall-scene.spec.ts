import { expect, test, type Page } from '@playwright/test';

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

async function seed(page: Page, count: number) {
  const artist = await page.request.post('/api/artists', { data: { name: `Wall-${suffix()}` } });
  const artistId = (await artist.json()).id as string;

  const titles: string[] = [];
  for (let i = 0; i < count; i += 1) {
    const title = `Wall-${i} ${suffix()}`;
    const made = await page.request.post('/api/records', { data: { title, artistId } });
    expect(made.status(), 'the fixture must exist for this to test anything').toBe(201);
    titles.push(title);
  }
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
  for (let offset = 20; offset < 400; offset += 12) {
    await page.mouse.click(box.x + offset, box.y + 120);

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
  for (const count of [5, 130]) {
    const { artistId } = await seed(page, count);
    await openWall(page, artistId);

    const scene = page.getByTestId('wall-scene');
    const box = await scene.locator('canvas').boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    await clickASpine(page, box);
    await expect(scene).not.toHaveAttribute('data-pulled', '');
    await page.waitForTimeout(900);

    const settled = await page.evaluate(() => {
      const el = document.querySelector('[data-testid="wall-scene"]') as HTMLElement;
      return {
        x: Number(el.dataset.settledNdcX ?? 9),
        y: Number(el.dataset.settledNdcY ?? 9),
      };
    });

    /*
      Tolerance is generous because the rise may not have settled to the last
      sub-pixel; the defect was 0.838, so anything this catches is real.
    */
    expect(Math.abs(settled.x), `${count} records: horizontally centred`).toBeLessThan(0.05);
    expect(Math.abs(settled.y), `${count} records: vertically centred`).toBeLessThan(0.05);
  }
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
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30);
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
  await page.mouse.click(box.x + box.width - 30, box.y + box.height - 30);
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
   * **Asserted against SCROLL, not resize.** A resize would be the stronger
   * fixture — it re-wraps every row — but the scene does not rebuild on resize
   * at all: a comment claims a `ResizeObserver` bumps a version counter and no
   * such counter exists. That is recorded in NOTES as its own gap rather than
   * fixed here, and a test that asserted it would be asserting a feature this
   * unit did not build.
   *
   * Scroll is what the rule was written for and is reachable by anyone with a
   * wheel: the page scrolls freely while a record is out.
   */
  const { artistId } = await seed(page, 60);
  await openWall(page, artistId);

  const scene = page.getByTestId('wall-scene');
  const box = await scene.locator('canvas').boundingBox();
  if (box === null) return;

  await clickASpine(page, box);
  await expect(scene).not.toHaveAttribute('data-pulled', '');
  await page.waitForTimeout(900);

  // Scroll while the record is out — the case the rule exists for.
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);

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

  await page.mouse.click(box.x + box.width - 30, box.y + 40);
  await page.waitForTimeout(1200);

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
