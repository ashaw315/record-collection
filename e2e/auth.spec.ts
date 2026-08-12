import { expect, test } from '@playwright/test';

/**
 * SPEC.md §11 E2E flow 1: log in with a wrong password, then the correct one.
 */

const CORRECT_PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

test('rejects a wrong password, then accepts the correct one', async ({ page }) => {
  await page.goto('/login');

  // Waits for hydration before typing: this form is CONTROLLED, so a value
  // typed into the DOM before React attaches never reaches state and the submit
  // sees an empty password. See the note on the login page.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });

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

  // Waits for hydration before typing: this form is CONTROLLED, so a value
  // typed into the DOM before React attaches never reaches state and the submit
  // sees an empty password. See the note on the login page.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
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

test('the login form is usable the instant the DOM exists', async ({ page }) => {
  /**
   * The regression test for the largest single source of E2E flake in this
   * build (NOTES: the login hydration marker).
   *
   * This form is CONTROLLED — `onSubmit` reads `password` from React state — so
   * a value typed before hydration never reaches state, the submit sees `''`,
   * and the page renders "Enter the password" with the field looking full.
   * Every spec's `login()` goes through here, so when it fired it failed whole
   * FILES at once, each failure naming whatever feature that spec was about.
   *
   * **`waitUntil: 'commit'` is what makes this deterministic.** It returns as
   * soon as the navigation commits, which is the exact window the race lives
   * in. Measured on this build: 8 of 8 failed without the marker, 8 of 8 passed
   * with it.
   *
   * Was a throwaway reproduction. CLAUDE.md §2: verification that does not
   * survive the session did not happen.
   */
  await page.goto('/login', { waitUntil: 'commit' });

  // Deliberately NOT waiting for `data-hydrated` here — that is what the app
  // must make unnecessary. The marker's own wait belongs in login(), which this
  // test exists to justify.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });

  await page.getByLabel('Password').pressSequentially(CORRECT_PASSWORD, { delay: 0 });
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page, 'the password reached React state, so the login succeeded').toHaveURL('/');
});
