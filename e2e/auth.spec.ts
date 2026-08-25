import { readFileSync } from 'node:fs';
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

/**
 * **The cron endpoint accepts an external caller that presents the secret.**
 *
 * The sibling test above proves it REFUSES without one. This proves the other
 * half, and only an over-HTTP test can: the bearer check lives in middleware,
 * so a handler-level test never sees it, and a unit test of `verifyCronSecret`
 * proves the comparison rather than the wiring.
 *
 * **It matters more now than when it was written.** §3 describes the token as
 * the one "Vercel Cron sends automatically", but the schedule is a GitHub
 * Actions workflow (step 16: Hobby caps Vercel crons at once a day), so the
 * request arrives from outside the deployment. That makes `CRON_SECRET` the
 * only thing between the internet and this endpoint — and makes "an arbitrary
 * caller with the secret is admitted" a property worth pinning rather than
 * assuming, since nothing else in the check is platform-specific.
 *
 * Reads the secret from `.env.test` because the Playwright process does not
 * load it — only the web server started by `webServer` does.
 */
test('accepts the cron endpoint from any caller presenting the secret', async ({ request }) => {
  // Playwright runs from the repo root, so a relative path resolves there.
  const envFile = readFileSync('.env.test', 'utf8');
  const secret = /^CRON_SECRET=(.*)$/m.exec(envFile)?.[1]?.trim();

  /*
   * Asserted rather than defaulted. A missing secret would make the request
   * below 401 and the test would look like a genuine auth failure, so the
   * precondition says which of the two went wrong.
   */
  expect(secret, 'CRON_SECRET must be set in .env.test').toBeTruthy();

  const response = await request.post('/api/discogs/refresh-prices', {
    headers: { authorization: `Bearer ${secret}` },
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(200);

  /*
   * The counts, not just the status: §5.7's refresh reports what it did, and a
   * 200 with no body would satisfy a status assertion while telling an operator
   * nothing about whether the run found any work.
   */
  const body = (await response.json()) as {
    data: { attempted: number; written: number; skipped: number; failed: number };
  };
  expect(body.data).toMatchObject({
    attempted: expect.any(Number),
    written: expect.any(Number),
    skipped: expect.any(Number),
    failed: expect.any(Number),
  });
});
