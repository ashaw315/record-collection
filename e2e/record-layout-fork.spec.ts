import { expect, test, type Page } from '@playwright/test';
import { deleteRecordsByArtist } from './cleanup';

/**
 * **§10b/A32: the pulled record's facts flank it or stack beneath it, by width.**
 *
 * Above the measured threshold there is room for a panel beside a readable
 * record; below it the record fills the frame and the facts become a summary
 * card stacked under it. This asserts the fork lands on the right side at each
 * width, and that BOTH shapes reach `/records/:id` — the destination §10b's
 * keyboard list also uses, so they cannot describe different facts.
 *
 * Driven on `/`, the real wall, because the fork is a property of the rendered
 * scene and a className test would not know whether a panel actually overlapped
 * the record (this unit's recurring lesson).
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
  const record = await page.request.post('/api/records', {
    data: { title: `Fork ${run}`, artistId, releaseYear: 1990 },
  });
  expect(record.status()).toBe(201);
  return artistId;
}

/** Walk the first row until a spine is hit — the raycast has no DOM target. */
async function pullASpine(page: Page) {
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior }));
  await page.waitForTimeout(200);
  const box = await page.getByTestId('wall-scene').locator('canvas').boundingBox();
  if (!box) throw new Error('no canvas');
  for (let offset = 20; offset < 600; offset += 12) {
    await page.mouse.click(box.x + offset, box.y + 120);
    const pulled = await page.evaluate(
      () => (document.querySelector('[data-testid="wall-scene"]') as HTMLElement)?.dataset.pulled ?? '',
    );
    if (pulled !== '') return;
  }
  throw new Error('no spine hit');
}

let artistId: string;

test.beforeEach(async ({ page }) => {
  await login(page);
  artistId = await seedOne(page);
});

test.afterEach(async ({ page }) => {
  await deleteRecordsByArtist(page, artistId);
});

test('a phone stacks the summary beneath the record', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);
  await page.waitForTimeout(2000);

  await expect(page.getByTestId('record-chrome-stacked')).toBeVisible();
  await expect(page.getByTestId('record-chrome-facts')).toHaveCount(0);

  /* The summary is the readable channel here, and it links to the detail page. */
  const card = page.getByTestId('summary-card');
  await expect(card).toBeVisible();
  await expect(card).toHaveAttribute('href', /^\/records\//);
});

test('a desktop flanks the record with the full panels', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);
  await page.waitForTimeout(2000);

  await expect(page.getByTestId('record-chrome-facts')).toBeVisible();
  await expect(page.getByTestId('record-chrome-actions')).toBeVisible();
  await expect(page.getByTestId('record-chrome-stacked')).toHaveCount(0);
});

test('both shapes send the reader to the record detail page', async ({ page }) => {
  /*
    The stacked summary's tap and the flanking panel's "Full details" both reach
    `/records/:id`. Asserted on the phone because the stacked summary is the
    whole card; the flanking "Full details" link is covered by the actions
    panel's own tests.
  */
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);
  await page.waitForTimeout(2000);

  const href = await page.getByTestId('summary-card').getAttribute('href');
  expect(href, 'the card links somewhere').not.toBeNull();
  await page.getByTestId('summary-card').click();
  await expect(page).toHaveURL(href ?? '/records/none', { timeout: 20_000 });
});
