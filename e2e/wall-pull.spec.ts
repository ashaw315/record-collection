import { expect, test, type Page } from '@playwright/test';
import { SLIDE, project } from '../src/app/wall/geometry';
import { PULL_DURATION_MS } from '../src/app/wall/pull-curve';
import { RETURN_FADE_END, WALL_PAPER_HEX, pullFill } from '../src/app/wall/pull-colour';
import { recordLadder } from '../src/lib/colour/record-ladder';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';

/**
 * The pull on the 1:1 wall, with colour arriving across it (8a §11.2, §11.3).
 *
 * **Under a fake clock, so the gesture can be stepped.** Everything §11.2
 * rules about colour is a claim about WHEN — across the curve, not at either
 * end; gone before the spine lands — and at speed a fill one frame late looks
 * fine. `page.clock` drives `requestAnimationFrame` and `performance.now`, so
 * the same rendering is sampled at chosen milliseconds instead of watched.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/** Wired: a cover, a clamped base, and the record the probe already pulls. */
const WIRED_INDEX = COLLECTION_SPINES.findIndex((row) => row.title === 'Wired');
const WIRED_ID = `collection-${WIRED_INDEX}`;
const wired = recordLadder(COLLECTION_SPINES[WIRED_INDEX]?.resampled ?? null);

const FRAME_MS = 1000 / 60;
/*
  `runFor` takes whole milliseconds and floors a fraction, so a gesture run for
  1000 + 16.67 ends a frame short — progress 0.992, a fill that rounds to the
  base, and a return click the component rightly refuses. Settle time is two
  whole frames past the duration.
*/
const SETTLED_MS = PULL_DURATION_MS + Math.ceil(2 * FRAME_MS);
const STEP_MS = Math.ceil(FRAME_MS);

/** The pulled record: its front face's points, and the FIELD's fill — the right face, where colour arrives. */
async function pulled(page: Page) {
  return page.evaluate(() => {
    const el = document.querySelector('[data-pulled]');
    const front = el?.querySelector('[data-face="front"]');
    const field = el?.querySelector('[data-field]');
    if (el === null || el === undefined || !front || !field) return null;
    const points = (front.getAttribute('points') ?? '').split(' ').map((pair) => pair.split(',').map(Number));
    return { fill: field.getAttribute('fill'), points, id: el.getAttribute('data-pulled') };
  });
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.clock.install();
  await page.goto('/wall/probe/labelled');
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  /*
    **Paused, not merely installed.** An installed clock keeps running in real
    time until it is paused, so `runFor` was ADDING to the milliseconds the
    test itself took between samples — the return landed at "907ms" of a
    timeline that had really passed 1000. From here time moves only by
    `runFor`, which is what makes the frame-step assertions frame-steps.
  */
  await page.clock.pauseAt(Date.now() + 1000);
});

test('clicking a spine slides it forward: the same face moved, the slot emptied, the plane whole', async ({
  page,
}) => {
  expect(wired).not.toBeNull();
  const seatBefore = await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).getAttribute('points');

  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(1);

  /* Frame 0: the pulled polygon starts where the seated spine was. */
  const start = await pulled(page);
  expect(start?.id).toBe(WIRED_ID);
  const seatedPoints = (seatBefore ?? '').split(' ').map((pair) => pair.split(',').map(Number));
  expect(start?.points, 'the pulled polygon starts on the seated face').toEqual(seatedPoints);
  await expect(page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`)).toHaveCount(0);

  await page.clock.runFor(SETTLED_MS);
  const end = await pulled(page);
  expect(end).not.toBeNull();
  if (end === null) return;

  /*
    D2: the same object, slid SLIDE along the depth axis — every corner moved
    by project(0, SLIDE, 0) from the seated face, no scaling, no shear resolved.
  */
  const seated = (seatBefore ?? '').split(' ').map((pair) => pair.split(',').map(Number));
  const [dx, dy] = project(0, SLIDE, 0);
  end.points.forEach((corner, index) => {
    expect(corner[0], `corner ${index} x`).toBeCloseTo(seated[index][0] + dx, 1);
    expect(corner[1], `corner ${index} y`).toBeCloseTo(seated[index][1] + dy, 1);
  });

  /* The shelf run still spans the seat: as many runs as before, none split. */
  await expect(page.locator('[data-wall="labelled"] [data-plane]')).toHaveCount(1);
});

test('colour arrives across the pull — paper at 0, the fill the curve gives at 500ms, base at the end', async ({
  page,
}) => {
  if (wired === null) throw new Error('fixture');
  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(1);
  expect((await pulled(page))?.fill, 'starts as paper').toBe(pullFill(0, wired));

  await page.clock.runFor(499);
  const mid = (await pulled(page))?.fill ?? '';
  expect(mid, 'not paper, not base, at halfway').not.toBe(WALL_PAPER_HEX);
  expect(mid).not.toBe(pullFill(1, wired));
  /*
    rAF quantisation: the first frame after the click starts the gesture, so
    the sampled progress sits within two frames of 0.5, at ms resolution.
  */
  const candidates = new Set<string>();
  for (let ms = 500 - 2 * FRAME_MS; ms <= 500 + FRAME_MS; ms += 1) {
    candidates.add(pullFill(ms / PULL_DURATION_MS, wired));
  }
  expect([...candidates], 'on the curve at 500ms').toContain(mid);

  await page.clock.runFor(PULL_DURATION_MS);
  expect((await pulled(page))?.fill, 'the clamped base, exactly').toBe(pullFill(1, wired));
});

test('on the return the fade completes before the spine lands — checked on the last frames', async ({
  page,
}) => {
  if (wired === null) throw new Error('fixture');
  const spine = page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`);
  await spine.click();
  await page.clock.runFor(SETTLED_MS);

  /* Send it back. */
  await page.locator('[data-pulled] [data-field]').click();
  await page.clock.runFor(1);
  expect((await pulled(page))?.fill, 'leaves in colour').not.toBe(WALL_PAPER_HEX);

  /*
    Step to the fade's end: paper from here on, while the record is still
    travelling. The gesture's own t0 is the first rAF after the click, up to
    one frame after the test's — so the window opens two frames past the
    fade's end in wall-clock terms, and every frame from there to landing is
    checked.
  */
  const fadeEndMs = Math.ceil(RETURN_FADE_END * PULL_DURATION_MS) + 2 * FRAME_MS;
  await page.clock.runFor(fadeEndMs);
  let frames = 0;
  for (let ms = fadeEndMs; ms < PULL_DURATION_MS; ms += STEP_MS) {
    const now = await pulled(page);
    expect(now, `still returning at ${ms.toFixed(0)}ms`).not.toBeNull();
    expect(now?.fill, `paper at ${ms.toFixed(0)}ms`).toBe(WALL_PAPER_HEX);
    /* And not yet seated: the top edge still carries less than the full rise. */
    frames += 1;
    await page.clock.runFor(STEP_MS);
  }
  expect(frames, 'frames the viewer sees in paper before landing').toBeGreaterThan(10);

  await page.clock.runFor(STEP_MS * 3);
  await expect(spine, 'landed: the seated face is back').toHaveCount(1);
  await expect(spine).toHaveAttribute('fill', /oklch\(0\.925/);
  await expect(page.locator('[data-pulled]')).toHaveCount(0);
});
