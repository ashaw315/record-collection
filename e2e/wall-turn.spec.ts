import { expect, test, type Page } from '@playwright/test';
import { LANDING_PAD, landedSquare, parseMatrix } from '../src/app/wall/landing';
import { PULL_DURATION_MS } from '../src/app/wall/pull-curve';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';

/**
 * §11.14: the pull has two phases — out, then round — and the square is the
 * second one's end. Phase one is §11.2's pull, unchanged; phase two turns the
 * record onto the page's plane. The two abut with no hold, and the boundary
 * is legible from the velocity: ease-out into ease-in-out.
 *
 * On the turn probe, under a paused clock. The probe exists to settle what a
 * still cannot: phase two's duration, whether zero hold reads as two motions,
 * and whether a straight corner path reads as a turn or a morph. This spec
 * fixes what is ruled — the join, the ends, the panel's timing, the wall
 * staying still — so the probe can be watched for the rest.
 */
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const FRAME_MS = 1000 / 60;
const TWO_FRAMES = Math.ceil(2 * FRAME_MS);
const WIRED_ID = `collection-${COLLECTION_SPINES.findIndex((row) => row.title === 'Wired')}`;
const TURN_MS = 600;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function open(page: Page, path: 'linear' | 'rotation') {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.clock.install();
  await page.goto(`/wall/probe/turn?ms=${TURN_MS}&path=${path}`);
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  await page.clock.pauseAt(Date.now() + 1000);
}

const landing = (page: Page) => page.locator('[data-pulled] [data-landing]').getAttribute('transform');
const phase = (page: Page) => page.locator('[data-wall-container]').getAttribute('data-phase');
const furniture = (page: Page) =>
  page.locator('[data-wall="labelled"] [data-furniture]').evaluateAll((els) => els.map((el) => el.getAttribute('points')).join('|'));

test('out, then round: the turn begins where the pull ends, with no hold, and the panel arrives with it', async ({ page }) => {
  await open(page, 'linear');
  const still = await furniture(page);
  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(1);
  const region = await page.locator('[data-region="wall"]').evaluate((el) => ({ w: el.clientWidth, h: el.clientHeight }));

  /* Phase one, to its last frame: in projection, no panel. */
  await page.clock.runFor(PULL_DURATION_MS - TWO_FRAMES - 1);
  expect(await phase(page)).toBe('pull');
  expect(parseMatrix((await landing(page)) ?? '')[1], 'still sheared at the wall’s angle').toBeLessThan(0);
  await expect(page.getByTestId('record-chrome')).toHaveCount(0);

  /* The boundary: within two frames of 1000ms the turn is on, and the panel with it. */
  await page.clock.runFor(2 * TWO_FRAMES);
  expect(await phase(page)).toBe('turn');
  await expect(page.getByTestId('record-chrome')).toHaveCount(1);
  const early = parseMatrix((await landing(page)) ?? '');

  /* Leaving from rest: the first frames of the turn move less than frames mid-turn. */
  await page.clock.runFor(TWO_FRAMES);
  const earlyNext = parseMatrix((await landing(page)) ?? '');
  await page.clock.runFor(TURN_MS / 2 - 2 * TWO_FRAMES);
  const mid = parseMatrix((await landing(page)) ?? '');
  await page.clock.runFor(TWO_FRAMES);
  const midNext = parseMatrix((await landing(page)) ?? '');
  const step = (a: number[], b: number[]) => Math.abs(b[1] - a[1]);
  expect(step(early, earlyNext), 'from rest').toBeLessThan(step(mid, midNext) / 4);

  /* The end: the page square, exactly, on the page's plane. */
  await page.clock.runFor(TURN_MS);
  expect(await phase(page)).toBe('landed');
  const [a, b, c, d, e, f] = parseMatrix((await landing(page)) ?? '');
  expect(b).toBe(0);
  expect(c).toBe(0);
  /* The square in the region's px; the group's matrix is in the svg's frame, whose viewBox origin offsets it. */
  /* The view as the code froze it: the svg sits LANDING_PAD below the region's content top. */
  const square = landedSquare({ x: 0, y: -LANDING_PAD, width: region.w, height: region.h - LANDING_PAD });
  const [frameX, frameY] = ((await page.locator('[data-wall="labelled"]').getAttribute('viewBox')) ?? '0 0').split(' ').map(Number);
  const field = page.locator('[data-pulled] [data-field]');
  expect(a * Number(await field.getAttribute('width'))).toBeCloseTo(square.size, 6);
  expect(d * Number(await field.getAttribute('height'))).toBeCloseTo(square.size, 6);
  expect(e - frameX).toBeCloseTo(square.x, 6);
  expect(f - frameY).toBeCloseTo(square.y, 6);
  /* The wall did not pan, scale or dim; the seat stayed empty from the first frame. */
  expect(await furniture(page)).toBe(still);
  await expect(page.locator(`[data-seat="${WIRED_ID}"]`)).toHaveCount(0);
  await expect(page.locator('[data-pulled] [data-face="front"]')).toHaveAttribute('opacity', '0');
});

test('put back is both phases reversed, in reverse order — round, then in', async ({ page }) => {
  await open(page, 'linear');
  const spine = page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`);
  await spine.click();
  await page.clock.runFor(PULL_DURATION_MS + TURN_MS + 2 * TWO_FRAMES);
  expect(await phase(page)).toBe('landed');

  await page.locator('[data-pulled] [data-field]').click();
  await page.clock.runFor(TURN_MS / 2);
  expect(await phase(page)).toBe('round');
  expect(parseMatrix((await landing(page)) ?? '')[1], 'turning back into the projection').toBeLessThan(0);
  await expect(page.getByTestId('record-chrome'), 'the panel leaves with the turn').toHaveCount(0);

  await page.clock.runFor(TURN_MS / 2 + TWO_FRAMES + PULL_DURATION_MS / 2);
  expect(await phase(page)).toBe('return');
  await page.clock.runFor(PULL_DURATION_MS / 2 + 2 * TWO_FRAMES);
  await expect(spine, 'seated again').toHaveCount(1);
  await expect(page.locator('[data-pulled]')).toHaveCount(0);
});

test('the corner path is a probe parameter: rotation and linear share their ends and differ between', async ({ page }) => {
  await open(page, 'rotation');
  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(PULL_DURATION_MS + TURN_MS / 2);
  const rotation = parseMatrix((await landing(page)) ?? '');
  /* The rotation path keeps the vertical edge vertical and swings the top edge: c is exactly 0 mid-turn, b is not. */
  expect(rotation[2]).toBe(0);
  expect(rotation[1]).toBeLessThan(0);
  await page.clock.runFor(TURN_MS);
  const end = parseMatrix((await landing(page)) ?? '');
  expect(end[1]).toBe(0);
  expect(end[2]).toBe(0);
});
