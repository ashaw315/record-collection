import { expect, test, type Page } from '@playwright/test';
import { PULL_DURATION_MS } from '../src/app/wall/pull-curve';
import { COLLECTION_SPINES } from '../test/fixtures/collection-spines';

/**
 * §11.3 on the rendering: the pulled record shows its cover at its own aspect
 * on its RIGHT face (D2), inside that face throughout the slide, over the
 * field where its colour arrives — and nothing paints over the pulled record,
 * which is what the global painter's order is for.
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

test('the pulled record shows its cover, fitted inside its face, at the end and mid-gesture', async ({
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
      const pulled = document.querySelector('[data-pulled]');
      const field = pulled?.querySelector('[data-field]')?.getBoundingClientRect();
      const cover = pulled?.querySelector('[data-cover]')?.getBoundingClientRect();
      return field && cover
        ? {
            field: { l: field.left, r: field.right, t: field.top, b: field.bottom },
            cover: { l: cover.left, r: cover.right, t: cover.top, b: cover.bottom },
          }
        : null;
    });

  /* Mid-slide: the cover is inside the field's box, on the same plane. */
  const mid = await boxes();
  expect(mid).not.toBeNull();
  if (mid !== null) {
    expect(mid.cover.l).toBeGreaterThanOrEqual(mid.field.l - 0.5);
    expect(mid.cover.r).toBeLessThanOrEqual(mid.field.r + 0.5);
    expect(mid.cover.t).toBeGreaterThanOrEqual(mid.field.t - 0.5);
    expect(mid.cover.b).toBeLessThanOrEqual(mid.field.b + 0.5);
  }

  await page.clock.runFor(PULL_DURATION_MS + 40);
  const end = await boxes();
  expect(end).not.toBeNull();
  if (end === null) return;

  const image = page.locator('[data-cover]');
  await expect(image).toHaveAttribute('href', WIDE_COVER);
  await expect(image).toHaveAttribute('preserveAspectRatio', 'xMidYMid meet');
  await expect(image).toHaveAttribute('opacity', '1');

  /* Inset on the field, and inside it: a 3:1 sleeve letterboxes there — own aspect, uncropped. */
  expect(end.cover.l).toBeGreaterThan(end.field.l);
  expect(end.cover.r).toBeLessThan(end.field.r);
  expect(end.cover.t).toBeGreaterThan(end.field.t);
  expect(end.cover.b).toBeLessThan(end.field.b);

  /* Nothing paints over the pulled record: the point at its field's centre hits the field. */
  const hit = await page.evaluate(() => {
    const field = document.querySelector('[data-pulled] [data-field]');
    if (field === null) return null;
    const r = field.getBoundingClientRect();
    const el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return el?.closest('[data-pulled]') !== null;
  });
  expect(hit, 'the slid record is in front of everything at its depth').toBe(true);
});

test('the record with no cover arrives at type on its field, with the diagonal, not at a swatch', async ({
  page,
}) => {
  await login(page);
  await page.clock.install();
  await page.goto('/wall/probe/labelled');
  await page.locator('[data-wall="labelled"]').waitFor({ timeout: 15_000 });
  await page.clock.pauseAt(Date.now() + 1000);

  const blues = COLLECTION_SPINES.findIndex((row) => row.resampled === null);
  expect(blues, 'the fixture has one record without a cover').toBeGreaterThan(-1);
  await page.locator(`[data-seat="collection-${blues}"] [data-spine]`).click();
  await page.clock.runFor(PULL_DURATION_MS + 40);

  const sleeve = page.locator('[data-pulled] [data-no-cover]');
  await expect(sleeve).toHaveCount(1);
  await expect(sleeve).toContainText(COLLECTION_SPINES[blues].title);
  await expect(sleeve).toContainText(COLLECTION_SPINES[blues].artist);
  await expect(page.locator('[data-pulled] [data-diagonal]')).toHaveCount(1);
  await expect(page.locator('[data-pulled] [data-cover]')).toHaveCount(0);
  /* The fitted title does not overflow its box — the rendered check the advance estimate stands in for. */
  /* Line boxes from a Range: a bounding box inside the sheared plane is taller than the text. */
  const fit = await page.locator('[data-pulled] [data-sleeve-title]').evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const tops = new Set(Array.from(range.getClientRects()).map((r) => Math.round(r.top)));
    return { over: el.scrollWidth > el.clientWidth + 1, size: getComputedStyle(el).fontSize, lines: tops.size };
  });
  expect(fit.over, `title overflows its measure at ${fit.size}`).toBe(false);
  expect(fit.lines).toBeLessThanOrEqual(3);
});
