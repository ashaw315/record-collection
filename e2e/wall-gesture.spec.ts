import { expect, test, type Page } from '@playwright/test';
import { parseMatrix } from '../src/app/wall/landing';
import { OUT_MS, RETURN_MS, ROTATION_START, SWING_MS, TRAVEL, easeInOutCubic } from '../src/app/wall/gesture';
import { COS30, SIN30 } from '../src/app/wall/geometry';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';

/**
 * §11.19 / §11.21: the assembled gesture, watched under a paused clock. The
 * rotation joins at 42% of the swing with the panel; the foot of the cover's
 * near edge is the one point growth and rotation hold; put back is the whole
 * gesture reversed on one clock, from wherever it stood.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const FRAME_MS = 1000 / 60;
const TWO_FRAMES = Math.ceil(2 * FRAME_MS);
const WIRED_ID = `collection-${COLLECTION_SPINES.findIndex((row) => row.title === 'Wired')}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.install();
  await page.goto('/wall/probe/labelled');
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  await page.clock.pauseAt(Date.now() + 1000);
});

const phase = (page: Page) => page.locator('[data-wall-container]').getAttribute('data-phase');
const spineWidth = (page: Page) =>
  page.locator('[data-pulled] [data-face="front"]').evaluate((el) => {
    const xs = (el.getAttribute('points') ?? '').split(' ').map((pair) => Number(pair.split(',')[0]));
    return Math.max(...xs) - Math.min(...xs);
  });
/** The foot of the pivot edge — the cover's near-bottom corner, local (0, 150) on the cover's plane — in the svg's px. */
const foot = (page: Page) =>
  page.locator('[data-pulled] [data-landing]').evaluate((el) => {
    const m = (el.getAttribute('transform') ?? '').replace(/^matrix\(|\)$/g, '').split(' ').map(Number);
    return [m[4] + m[2] * 150, m[5] + m[3] * 150];
  });

test('the rotation joins at 42% of the swing — with the panel — and the spine closes to nothing by its end', async ({ page }) => {
  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  const join = ROTATION_START * SWING_MS;
  await page.clock.runFor(join - TWO_FRAMES);
  const before = await spineWidth(page);
  await expect(page.getByTestId('record-chrome'), 'no panel before the record turns').toHaveCount(0);
  await page.clock.runFor(2 * TWO_FRAMES);
  await expect(page.getByTestId('record-chrome'), 'the panel arrives with the rotation').toHaveCount(1);
  /* Growth widens the spine faster than the first degrees close it; by 85% of the rotation's window the closing has won. */
  await page.clock.runFor(0.85 * (SWING_MS - join));
  expect(await spineWidth(page), 'closing').toBeLessThan(before);
  await page.clock.runFor(SWING_MS);
  expect(await spineWidth(page), 'closed at 45°').toBeLessThan(0.5);
});

test('the foot of the cover’s near edge moves only with the travel — growth and rotation hold it, and nothing drifts (§11.21, §11.22)', async ({ page }) => {
  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(1);
  const f0 = await foot(page);
  let elapsed = 1;
  for (const ms of [546, 900, 1300]) {
    await page.clock.runFor(ms - elapsed);
    elapsed = ms;
    const f = await foot(page);
    /* In the svg's own px: +y travel projects to (−cos30, +sin30) per unit, within two frames of the gesture's time. */
    const travel = TRAVEL * easeInOutCubic(ms / SWING_MS);
    const slack = TRAVEL * (easeInOutCubic((ms + 2 * FRAME_MS) / SWING_MS) - easeInOutCubic(ms / SWING_MS)) + 0.5;
    expect(Math.abs(f[0] - f0[0] + travel * COS30), `x at ${ms}`).toBeLessThan(slack * COS30 + 0.5);
    expect(Math.abs(f[1] - f0[1] - travel * SIN30), `y at ${ms}`).toBeLessThan(slack * SIN30 + 0.5);
  }
});

test('the view pans to frame the landing on the swing’s ease — the wall still relative to itself, the record in frame at the end (§11.22)', async ({ page }) => {
  const region = page.locator('[data-region="wall"]');
  const scroll = () => region.evaluate((el) => [el.scrollLeft, el.scrollTop]);
  const upright = () => page.locator('[data-furniture="upright-front"]').first().evaluate((el) => el.getBoundingClientRect().left);
  const before = await upright();
  /* The first seat: its landing lies left of the region, so the view must pan. */
  await page.locator('[data-seat="collection-0"] [data-spine]').click();
  await page.clock.runFor(1);
  const s0 = await scroll();
  expect(Math.abs((await upright()) - before), 'the frame grew and the scroll was compensated: the wall did not move').toBeLessThan(1);
  await page.clock.runFor(546 - 1);
  const sJoin = await scroll();
  await page.clock.runFor(1300 - 546);
  const sEnd = await scroll();
  expect(sEnd[0], 'panned left toward the landing').toBeLessThan(s0[0]);
  /* On the swing's ease: e(0.42) of the way at the join, within two frames. */
  const ratio = (sJoin[0] - s0[0]) / (sEnd[0] - s0[0]);
  const slack = easeInOutCubic((546 + 2 * FRAME_MS) / SWING_MS) - easeInOutCubic(ROTATION_START);
  expect(Math.abs(ratio - easeInOutCubic(ROTATION_START))).toBeLessThan(slack + 0.02);
  /* The wall stayed still relative to itself: the upright moved on screen by exactly the pan. */
  expect(Math.abs((await upright()) - before - (s0[0] - sEnd[0]))).toBeLessThan(1.5);
  /* And the landing is in frame, arrows and all. */
  await page.clock.runFor(OUT_MS - 1300 + 2 * TWO_FRAMES);
  const inside = await page.evaluate(() => {
    const r = document.querySelector('[data-region="wall"]')?.getBoundingClientRect();
    const f = document.querySelector('[data-pulled] [data-field]')?.getBoundingClientRect();
    const n = document.querySelector('[data-testid="nav-next"]')?.getBoundingClientRect();
    return r && f ? { field: f.left >= r.left && f.right <= r.right && f.top >= r.top && f.bottom <= r.bottom, next: n ? n.left >= r.left && n.right <= r.right : false } : null;
  });
  expect(inside?.field, 'the landed record is inside the region').toBe(true);
  expect(inside?.next, 'and its arrow').toBe(true);
});

test('the pan settles where the empty seat clears the cover’s trailing edge — 55px, on screen, with the seat in the region (§11.26)', async ({ page }) => {
  /*
    A mid-row seat: with the wall rigid under the record, the 560 cover would
    cover its own seat (251px right of the foot, 145 up). The emptied seat has
    no element while its record is out, so its screen position is carried
    from rest by its fixed distance from the upright — the wall is rigid
    relative to itself.
  */
  const rect = (q: string) => page.evaluate((sel) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r ? { left: r.left, right: r.right } : null; }, q);
  const upright = '[data-furniture="upright-front"]';
  const seatAtRest = await rect(`[data-seat="${WIRED_ID}"] [data-spine]`);
  const uprightAtRest = await rect(upright);
  expect(seatAtRest && uprightAtRest).toBeTruthy();
  if (!seatAtRest || !uprightAtRest) return;
  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(OUT_MS + 2 * TWO_FRAMES);
  const [region, field, uprightLanded] = await Promise.all([rect('[data-region="wall"]'), rect('[data-pulled] [data-field]'), rect(upright)]);
  expect(region && field && uprightLanded).toBeTruthy();
  if (!region || !field || !uprightLanded) return;
  const seatLeft = uprightLanded.left + (seatAtRest.left - uprightAtRest.left);
  const seatRight = uprightLanded.left + (seatAtRest.right - uprightAtRest.left);
  expect(seatLeft - field.right, 'the seat clears the cover’s trailing edge by the clearance').toBeGreaterThanOrEqual(55 - 1.5);
  expect(seatLeft - field.right, 'and not by a different composition').toBeLessThan(55 + 12);
  expect(seatLeft >= region.left && seatRight <= region.right, 'the empty seat is in the region').toBe(true);
  expect(field.left >= region.left && field.right <= region.right, 'and so is the landed record').toBe(true);
});

test('put back pans the view back to where it began, on the same clock', async ({ page }) => {
  /* Measured on the wall's own screen position: scroll numbers are frame-relative and the frame changes with the landing. */
  const upright = () => page.locator('[data-furniture="upright-front"]').first().evaluate((el) => { const r = el.getBoundingClientRect(); return [r.left, r.top]; });
  const before = await upright();
  await page.locator(`[data-seat="collection-0"] [data-spine]`).click();
  await page.clock.runFor(OUT_MS + TWO_FRAMES);
  const landed = await upright();
  expect(Math.hypot(landed[0] - before[0], landed[1] - before[1]), 'the view panned').toBeGreaterThan(20);
  await page.keyboard.press('Escape');
  await page.clock.runFor(RETURN_MS + 2 * TWO_FRAMES);
  const back = await upright();
  expect(Math.abs(back[0] - before[0]), 'and panned back').toBeLessThan(1.5);
  expect(Math.abs(back[1] - before[1])).toBeLessThan(1.5);
});

test('put back is the whole gesture reversed on one clock, from wherever it stood', async ({ page }) => {
  const spine = page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`);
  await spine.click();
  await page.clock.runFor(OUT_MS + TWO_FRAMES);
  expect(await phase(page)).toBe('landed');
  const landed = parseMatrix((await page.locator('[data-pulled] [data-landing]').getAttribute('transform')) ?? '');
  expect(Math.abs(landed[1])).toBeLessThan(1e-6);

  await page.keyboard.press('Escape');
  await page.clock.runFor(RETURN_MS / 2);
  expect(await phase(page)).toBe('return');
  /* Half-way back is half-way out: in the projection again, the spine open, the panel still up since the rotation is. */
  const half = parseMatrix((await page.locator('[data-pulled] [data-landing]').getAttribute('transform')) ?? '');
  expect(half[1], 'sheared: back in the projection').toBeLessThan(-0.05);
  expect(await spineWidth(page)).toBeGreaterThan(1);

  await page.clock.runFor(RETURN_MS / 2 + 2 * TWO_FRAMES);
  await expect(spine, 'seated again').toHaveCount(1);
  await expect(page.locator('[data-pulled]')).toHaveCount(0);
  expect(await phase(page)).toBe('rest');
});

test('Escape mid-swing reverses from where the record stood, not from the end', async ({ page }) => {
  const spine = page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`);
  await spine.click();
  await page.clock.runFor(400);
  await page.keyboard.press('Escape');
  await page.clock.runFor(1);
  expect(await phase(page)).toBe('return');
  /* 400 of 1600 out is a quarter; the return has a quarter of its 860 to run. */
  await page.clock.runFor(RETURN_MS * 0.25 + 2 * TWO_FRAMES);
  await expect(spine, 'seated within a quarter of the return').toHaveCount(1);
});
