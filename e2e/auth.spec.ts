import { expect, test } from '@playwright/test';

/**
 * SPEC.md §11 E2E flow 1: log in with a wrong password, then the correct one.
 */

const CORRECT_PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

test('rejects a wrong password, then accepts the correct one', async ({ page }) => {
  await page.goto('/login');

  await page.getByLabel('Password').pressSequentially('definitely-the-wrong-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  // Scoped by id: Next's route announcer is also role="alert", so a bare
  // getByRole('alert') matches two elements.
  await expect(page.locator('#password-error')).toContainText(/incorrect password/i);
  await expect(page).toHaveURL(/\/login/);

  await page.getByLabel('Password').clear();
  await page.getByLabel('Password').pressSequentially(CORRECT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page).toHaveURL('/');
});

test('redirects an unauthenticated visitor to /login', async ({ page }) => {
  await page.goto('/');

  await expect(page).toHaveURL(/\/login/);
});

test('keeps the session across a reload, then clears it on logout', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Password').pressSequentially(CORRECT_PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  await page.reload();
  await expect(page).toHaveURL('/');

  const response = await page.request.post('/api/auth/logout');
  expect(response.ok()).toBe(true);

  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('returns 401 JSON for an unauthenticated API request', async ({ request }) => {
  const response = await request.get('/api/auth/session', { failOnStatusCode: false });

  expect(response.status()).toBe(401);
  const body = await response.json();
  expect(body.error.code).toBe('UNAUTHORIZED');
});

test('rejects the cron endpoint without a bearer token', async ({ request }) => {
  const response = await request.post('/api/discogs/refresh-prices', { failOnStatusCode: false });

  expect(response.status()).toBe(401);
});
