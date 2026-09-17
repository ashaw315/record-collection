import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedRecords } from './seed';

/**
 * What the gesture arrives at (8a §11.7): the panel, flat on paper, right of
 * the pulled record, appearing at the slide's perceived end. Two claims
 * inherit from the lit wall's composition tests: the chrome arrives with the
 * record rather than before it, and Escape sends the record home — from
 * settled, and mid-turn — taking the chrome with it.
 */

registerCleanup();
const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';
const suffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function seed(page: Page, count: number) {
  const artist = await page.request.post('/api/artists', { data: { name: `Wall-${suffix()}` } });
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);
  await seedRecords(artistId, 'Wall', suffix(), count);
  return artistId;
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.setViewportSize({ width: 1280, height: 900 });
});

test('the panel arrives with the record — at the slide’s perceived end, not before, beside the cover', async ({
  page,
}) => {
  const artistId = await seed(page, 12);
  await page.clock.install();
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  await page.clock.pauseAt(Date.now() + 1000);

  await page.locator('[data-seat] [data-spine]').first().click();
  await page.clock.runFor(400);
  await expect(page.getByTestId('record-chrome'), 'not there while the record is still visibly moving').toHaveCount(0);

  await page.clock.runFor(700);
  const chrome = page.getByTestId('record-chrome');
  await expect(chrome).toBeVisible();
  await expect(chrome.getByTestId('record-panel')).toHaveAttribute('data-expanded', 'true');
  await expect(chrome.getByTestId('action-turn')).toBeVisible();
  await expect(chrome.getByTestId('action-put')).toBeVisible();
  await expect(chrome.getByTestId('panel-detail-link')).toHaveAttribute('href', /\/records\//);

  /* Right of the pulled record, top-aligned to the cover's top edge, as wide as the cover: two columns. */
  const geometry = await page.evaluate(() => {
    const field = document.querySelector('[data-pulled] [data-field]')?.getBoundingClientRect();
    const panel = document.querySelector('[data-testid="record-chrome"]')?.getBoundingClientRect();
    return field && panel ? { fieldRight: field.right, fieldTop: field.top, fieldWidth: field.width, panelLeft: panel.left, panelTop: panel.top, panelWidth: panel.width } : null;
  });
  expect(geometry).not.toBeNull();
  if (geometry === null) return;
  expect(geometry.panelLeft).toBeGreaterThan(geometry.fieldRight);
  expect(Math.abs(geometry.panelTop - geometry.fieldTop)).toBeLessThan(2);
  expect(geometry.panelWidth).toBe(208);
  /* Nothing in the panel is sheared: its box is axis-aligned text in the page's plane. */
  const transform = await chrome.evaluate((el) => getComputedStyle(el).transform);
  expect(transform).toBe('none');
});

test('Escape dismisses, and a record dismissed MID-TURN goes home with its chrome', async ({ page }) => {
  const artistId = await seed(page, 6);
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByTestId('wall')).toBeAttached({ timeout: 30_000 });
  const first = page.locator('[data-seat] [data-spine]').first();
  const firstId = await page.locator('[data-seat]').first().getAttribute('data-seat');

  /* Escape from settled. */
  await first.click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-chrome')).toHaveCount(0);
  await expect(page.locator(`[data-seat="${firstId}"] [data-spine]`), 'seated again').toHaveCount(1, { timeout: 5000 });

  /* Turn over, then Escape before anything else: the back shows on the same face, then it goes home. */
  await page.locator(`[data-seat="${firstId}"] [data-spine]`).click();
  await expect(page.getByTestId('record-chrome')).toBeVisible({ timeout: 5000 });
  await page.getByTestId('record-chrome').getByTestId('action-turn').click();
  await expect(page.locator('[data-pulled] [data-back-plain], [data-pulled] [data-back]')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('record-chrome'), 'and the chrome goes with it').toHaveCount(0);
  await expect(page.locator(`[data-seat="${firstId}"] [data-spine]`)).toHaveCount(1, { timeout: 5000 });
  await expect(page.locator('[data-pulled]')).toHaveCount(0);
});
