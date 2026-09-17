import { expect, test, type Page } from '@playwright/test';
import { PULL_DURATION_MS } from '../src/app/wall/pull-curve';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';

/**
 * §11.3 on the rendering: the pulled record shows its cover at its own aspect,
 * inside the record's face throughout the gesture — a cover that stayed
 * axis-aligned while the face was still sheared would hang outside it.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/* A 3×1 red PNG: a wide sleeve, so "own aspect" is observable rather than square-on-square. */
const WIDE_COVER =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAMAAAABCAYAAAACpqUvAAAAEklEQVR4nGP4z8DwHwyBFAMDACaWBf1o13a/AAAAAElFTkSuQmCC';

const WIRED_INDEX = COLLECTION_SPINES.findIndex((row) => row.title === 'Wired');
const WIRED_ID = `collection-${WIRED_INDEX}`;

/* fixme: D2 puts the cover on the RIGHT face, which arrives with 5b's faces in the next unit. */
test.fixme('the pulled record shows its cover, fitted inside its face, at the end and mid-gesture', async ({
  page,
}) => {
  await login(page);
  await page.clock.install();
  await page.goto(`/wall/probe/labelled?cover=${encodeURIComponent(WIDE_COVER)}`);
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  await page.clock.pauseAt(Date.now() + 1000);

  await expect(page.locator('[data-cover]'), 'no cover at rest').toHaveCount(0);

  await page.locator(`[data-seat="${WIRED_ID}"] [data-spine]`).click();
  await page.clock.runFor(400);

  const boxes = async () =>
    page.evaluate(() => {
      const face = document.querySelector('[data-pulled]')?.getBoundingClientRect();
      const cover = document.querySelector('[data-cover]')?.getBoundingClientRect();
      return face && cover
        ? { face: { l: face.left, r: face.right, t: face.top, b: face.bottom }, cover: { l: cover.left, r: cover.right, t: cover.top, b: cover.bottom } }
        : null;
    });

  /* Mid-gesture: the cover is inside the sheared face's box, not hanging out of it. */
  const mid = await boxes();
  expect(mid).not.toBeNull();
  if (mid !== null) {
    expect(mid.cover.l).toBeGreaterThanOrEqual(mid.face.l - 0.5);
    expect(mid.cover.r).toBeLessThanOrEqual(mid.face.r + 0.5);
    expect(mid.cover.t).toBeGreaterThanOrEqual(mid.face.t - 0.5);
    expect(mid.cover.b).toBeLessThanOrEqual(mid.face.b + 0.5);
  }

  await page.clock.runFor(PULL_DURATION_MS);
  const end = await boxes();
  expect(end).not.toBeNull();
  if (end === null) return;

  const image = page.locator('[data-cover]');
  await expect(image).toHaveAttribute('href', WIDE_COVER);
  await expect(image).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');

  /* The image's box IS the pulled face; a 3:1 sleeve then letterboxes inside it — own aspect, uncropped. */
  expect(end.cover.l).toBeCloseTo(end.face.l, 0);
  expect(end.cover.r).toBeCloseTo(end.face.r, 0);
  expect(end.cover.t).toBeCloseTo(end.face.t, 0);
  expect(end.cover.b).toBeCloseTo(end.face.b, 0);
});
