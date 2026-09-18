import { expect, test, type Page } from '@playwright/test';
import { parseMatrix } from '../src/app/wall/landing';
import { OUT_MS, RETURN_MS, ROTATION_START, SWING_MS, easeInOutCubic } from '../src/app/wall/gesture';
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

test('the foot of the cover’s near edge moves on one straight path at the swing’s ease — growth and rotation hold it (§11.21)', async ({ page }) => {
  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(1);
  const f0 = await foot(page);
  const moved: Record<number, [number, number]> = {};
  let elapsed = 1;
  for (const ms of [546, 1300]) {
    await page.clock.runFor(ms - elapsed);
    elapsed = ms;
    const f = await foot(page);
    moved[ms] = [f[0] - f0[0], f[1] - f0[1]];
  }
  /* The travel (and the interim drift) both ride easeInOutCubic(k): the foot at 546 is e(0.42) of the way it is at 1300, on both axes, within two frames. */
  const ratio = easeInOutCubic(ROTATION_START);
  const slack = easeInOutCubic((546 + 2 * FRAME_MS) / SWING_MS) - ratio;
  for (const axis of [0, 1]) {
    const observed = moved[546][axis] / moved[1300][axis];
    expect(Math.abs(observed - ratio), `axis ${axis}`).toBeLessThan(slack + 0.02);
  }
  /* And the +y travel reads on screen as left and down: the foot ends left of and below where it started. */
  expect(moved[1300][0]).toBeLessThan(0);
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
