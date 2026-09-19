import { expect, test, type Page } from '@playwright/test';
import { parseMatrix } from '../src/app/wall/landing';
import { COS30, DEPTH, SIN30, SPINE_HEIGHT } from '../src/app/wall/geometry';
import { FINISH_MS, GROWTH, OUT_MS, RETURN_MS, SWING_MS, easeInOutCubic } from '../src/app/wall/gesture';
import { WIDEST } from '../src/app/wall/rotation';
import { RETURN_FADE_END, WALL_PAPER_HEX, pullFill } from '../src/app/wall/pull-colour';
import { recordLadder } from '../src/lib/colour/record-ladder';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';

/**
 * The pull on the 1:1 wall, with colour arriving across it (8a §11.2, §11.3,
 * §11.19–§11.21): one clock, travel, growth and rotation on it, the finish
 * after, and the return the whole gesture reversed.
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
const TWO_FRAMES = Math.ceil(2 * FRAME_MS);
const STEP_MS = Math.ceil(FRAME_MS);

const landing = (page: Page) => page.locator('[data-pulled] [data-landing]').getAttribute('transform');
const phase = (page: Page) => page.locator('[data-wall-container]').getAttribute('data-phase');
/** The pulled record's spine, as its projected width — the rigid rotation's signature, closing to zero at 45°. */
const spineWidth = (page: Page) =>
  page.locator('[data-pulled] [data-face="front"]').evaluate((el) => {
    const xs = (el.getAttribute('points') ?? '').split(' ').map((pair) => Number(pair.split(',')[0]));
    return Math.max(...xs) - Math.min(...xs);
  });

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

test('clicking a spine pulls it out on the gesture: the seat emptied from the first frame, the furniture whole, a rigid record at 45° at the swing’s end and a square of its own size after the finish', async ({
  page,
}) => {
  expect(wired).not.toBeNull();
  const furnitureBefore = await page.locator('[data-wall="labelled"] [data-furniture]').count();

  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(1);
  /* Frame 0: the cover plane is the seated face's own; the seat's anchor is gone. */
  const start = parseMatrix((await landing(page)) ?? '');
  expect(start[0]).toBeCloseTo(COS30, 6);
  expect(start[1]).toBeCloseTo(-SIN30, 6);
  await expect(page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`)).toHaveCount(0);
  expect(await phase(page)).toBe('swing');

  /* The swing's end: the spine has closed to nothing, the cover is level and at its widest — √2·cos30 of its grown run. */
  await page.clock.runFor(SWING_MS + TWO_FRAMES - 1);
  const [a45, b45, , d45] = parseMatrix((await landing(page)) ?? '');
  expect(Math.abs(b45)).toBeLessThan(0.02);
  expect(a45 * DEPTH).toBeCloseTo(DEPTH * GROWTH * WIDEST, 0);
  expect(d45 * SPINE_HEIGHT).toBeCloseTo(SPINE_HEIGHT * GROWTH, 0);
  expect(await spineWidth(page)).toBeLessThan(0.5);
  expect(await phase(page)).toBe('finish');

  /* The finish: the square, exactly axis-aligned. */
  await page.clock.runFor(FINISH_MS + TWO_FRAMES);
  const [a, b, c, d] = parseMatrix((await landing(page)) ?? '');
  expect(b).toBeCloseTo(0, 6);
  expect(c).toBeCloseTo(0, 6);
  expect(a * DEPTH).toBeCloseTo(DEPTH * GROWTH, 3);
  expect(d * SPINE_HEIGHT).toBeCloseTo(SPINE_HEIGHT * GROWTH, 3);
  expect(await phase(page)).toBe('landed');
  await expect(page.locator('[data-wall="labelled"] [data-furniture]')).toHaveCount(furnitureBefore);
  await expect(page.locator(`[data-seat="${WIRED_ID}"]`)).toHaveCount(0);
});

test('colour arrives across the full out-span on one ease (§11.2) — paper at 0, the curve’s fill at halfway, not yet base at the swing’s end, base when the record lands', async ({
  page,
}) => {
  if (wired === null) throw new Error('fixture');
  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(1);
  expect((await pulled(page))?.fill, 'starts as paper').toBe(pullFill(0, wired));

  await page.clock.runFor(OUT_MS / 2 - 1);
  const mid = (await pulled(page))?.fill ?? '';
  expect(mid, 'not paper, not base, at halfway').not.toBe(WALL_PAPER_HEX);
  expect(mid).not.toBe(pullFill(1, wired));
  /* rAF quantisation: the sampled time sits within two frames of the half. */
  const candidates = new Set<string>();
  for (let ms = OUT_MS / 2 - 2 * FRAME_MS; ms <= OUT_MS / 2 + FRAME_MS; ms += 1) {
    candidates.add(pullFill(easeInOutCubic(ms / OUT_MS), wired));
  }
  expect([...candidates], 'on the curve at halfway').toContain(mid);

  /* The swing's end is not the record's: 300ms of finish remain, and the colour has the same 300ms left. */
  await page.clock.runFor(SWING_MS - OUT_MS / 2);
  expect((await pulled(page))?.fill, 'still arriving at 1300').not.toBe(pullFill(1, wired));

  await page.clock.runFor(OUT_MS);
  expect((await pulled(page))?.fill, 'the clamped base, exactly').toBe(pullFill(1, wired));
});

test('on the return the fade completes before the spine lands — checked on the last frames', async ({
  page,
}) => {
  if (wired === null) throw new Error('fixture');
  const spine = page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`);
  await spine.click();
  await page.clock.runFor(OUT_MS + TWO_FRAMES);

  /* Send it back: the whole gesture reversed on one clock. */
  await page.locator('[data-pulled] [data-field]').click();
  await page.clock.runFor(1);
  expect(await phase(page)).toBe('return');
  expect((await pulled(page))?.fill, 'leaves in colour').not.toBe(WALL_PAPER_HEX);

  const fadeEndMs = Math.ceil(RETURN_FADE_END * RETURN_MS) + 2 * FRAME_MS;
  await page.clock.runFor(fadeEndMs);
  let frames = 0;
  for (let ms = fadeEndMs; ms < RETURN_MS; ms += STEP_MS) {
    const now = await pulled(page);
    expect(now, `still returning at ${ms.toFixed(0)}ms`).not.toBeNull();
    expect(now?.fill, `paper at ${ms.toFixed(0)}ms`).toBe(WALL_PAPER_HEX);
    frames += 1;
    await page.clock.runFor(STEP_MS);
  }
  expect(frames, 'frames the viewer sees in paper before landing').toBeGreaterThan(8);

  await page.clock.runFor(STEP_MS * 3);
  await expect(spine, 'landed: the seated face is back').toHaveCount(1);
  await expect(spine).toHaveAttribute('fill', /oklch\(0\.925/);
  await expect(page.locator('[data-pulled]')).toHaveCount(0);
});
