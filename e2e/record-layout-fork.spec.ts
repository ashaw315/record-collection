import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { PULL_DURATION_MS } from '../src/app/wall/pull-curve';

/**
 * **§10b/A32/A33: the pulled record's facts flank it or overlay it, by width.**
 *
 * Above the measured threshold there is room for a panel beside a readable
 * record; below it the record fills the frame and the facts overlay its lower
 * portion (A33a). The panel expands in place rather than navigating (A33b), and
 * reaches `/records/:id` by a link inside the expansion. This asserts the fork
 * lands on the right side at each width and behaves per A33.
 *
 * Driven on `/`, the real wall. §11.8: below the fork the panel OVERLAYS the
 * projection rather than competing with it for width — the wall does not
 * reflow, a narrow viewport shows fewer records, not smaller ones.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/** One record with a cover, so the wall has an unambiguous spine to pull. */
async function seedOne(page: Page): Promise<string> {
  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const artist = await page.request.post('/api/artists', { data: { name: `Fork-${run}` } });
  expect(artist.status()).toBe(201);
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  const record = await page.request.post('/api/records', {
    data: { title: `Fork ${run}`, artistId, releaseYear: 1990 },
  });
  expect(record.status()).toBe(201);
  return artistId;
}

/** The spines are anchors now (§11.8): the first one is a real DOM target. */
async function pullASpine(page: Page) {
  await page.locator('[data-seat] [data-spine]').first().click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await seedOne(page);
});

/* Records and artist removed after each test by the shared tracker. */
registerCleanup();

/*
  **Updated for A33.** These tests encoded A32's contract — a stacked card
  beneath the record whose tap navigated — which A33 changed to an overlay whose
  chevron expands in place. The testids changed with it: `record-chrome-stacked`
  is the overlay, `record-chrome-facts` the flanking wrapper, and the panel is
  `record-panel` (collapsed on the phone, always-expanded on desktop). The old
  `record-chrome-actions` is gone — the panel carries its own controls now.
*/
test('a phone overlays the record with a collapsed panel', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);

  await expect(page.getByTestId('record-chrome-stacked')).toBeVisible();
  await expect(page.getByTestId('record-chrome-facts')).toHaveCount(0);

  /* The overlay panel is collapsed on a phone (A33), and its chevron expands. */
  const panel = page.getByTestId('record-chrome').getByTestId('record-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-expanded', 'false');

  /*
    And the wall under it did not reflow: the pulled record's own face has the
    same points, at the same size, as on a desktop. (This spec seeds one record
    into an otherwise empty database, so the pulled one is the only face there is.)
  */
  /*
    Read once the slide has SETTLED. The panel appears at 0.69 of the travel
    with the face still moving, and in the tail it creeps by hundredths of a
    pixel per frame — two equal consecutive reads are not stillness. The
    slide's own duration is.
  */
  await page.waitForTimeout(PULL_DURATION_MS);
  const face = await page.locator('[data-pulled] [data-face="front"]').getAttribute('points');
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator('[data-pulled] [data-face="front"]')).toHaveAttribute('points', face ?? '');
});

test('a desktop flanks the record with an always-expanded panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);

  await expect(page.getByTestId('record-chrome-facts')).toBeVisible();
  await expect(page.getByTestId('record-chrome-stacked')).toHaveCount(0);

  /* A33d: the wide panel is the expanded shape at rest. */
  await expect(page.getByTestId('record-chrome').getByTestId('record-panel')).toHaveAttribute(
    'data-expanded',
    'true',
  );
});

test('both shapes reach the detail page by a link inside the expanded panel (A33)', async ({
  page,
}) => {
  /*
    A33 moved the destination INTO the expanded panel. On the phone the panel is
    collapsed, so it is expanded first; on desktop it is already expanded. Either
    way the link points at `/records/:id`, the one destination §10b's keyboard
    list also uses.
  */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);

  await page.getByTestId('record-chrome').getByTestId('panel-expand-toggle').click();
  const link = page.getByTestId('record-chrome').getByTestId('panel-detail-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^\/records\//);
});
