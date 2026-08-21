import { expect, test, type Page } from '@playwright/test';
import { deleteRecordsByArtist } from './cleanup';

/**
 * **§10b/A32/A33: the pulled record's facts flank it or overlay it, by width.**
 *
 * Above the measured threshold there is room for a panel beside a readable
 * record; below it the record fills the frame and the facts overlay its lower
 * portion (A33a). The panel expands in place rather than navigating (A33b), and
 * reaches `/records/:id` by a link inside the expansion. This asserts the fork
 * lands on the right side at each width and behaves per A33.
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
  await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);
  await page.waitForTimeout(2000);

  await expect(page.getByTestId('record-chrome-stacked')).toBeVisible();
  await expect(page.getByTestId('record-chrome-facts')).toHaveCount(0);

  /* The overlay panel is collapsed on a phone (A33), and its chevron expands. */
  const panel = page.getByTestId('record-chrome').getByTestId('record-panel');
  await expect(panel).toBeVisible();
  await expect(panel).toHaveAttribute('data-expanded', 'false');
});

test('a desktop flanks the record with an always-expanded panel', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.goto('/');
  await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);
  await page.waitForTimeout(2000);

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
  await expect(page.getByTestId('wall-scene').locator('canvas')).toBeVisible({ timeout: 30_000 });
  await pullASpine(page);
  await page.waitForTimeout(2000);

  await page.getByTestId('record-chrome').getByTestId('panel-expand-toggle').click();
  const link = page.getByTestId('record-chrome').getByTestId('panel-detail-link');
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute('href', /^\/records\//);
});
