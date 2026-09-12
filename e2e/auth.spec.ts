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

  /**
   * **GET, not POST — so the request is admitted without running the refresh.**
   *
   * `routeAuthMode` takes only the pathname (routes.ts:69), so middleware's
   * decision is method-agnostic: a GET with a valid secret is admitted exactly
   * as a POST would be. The route exports only POST, so Next answers 405 —
   * after middleware, without the handler.
   *
   * That is what makes this test honour §2 itself rather than relying on the
   * backstop. A POST here runs the real refresh loop, which calls Discogs once
   * per refreshable record; those four calls were only ever stopped by
   * `no-live-calls.ts` refusing them.
   */
  const response = await request.get('/api/discogs/refresh-prices', {
    headers: { authorization: `Bearer ${secret}` },
    failOnStatusCode: false,
  });

  /**
   * **Admission is the subject, and this test deliberately stops there.**
   *
   * Auth for this route is entirely middleware's (src/middleware.ts): a bad
   * token returns 401 and a good one returns `NextResponse.next()`. So "the
   * secret was accepted" is exactly "this is not a 401", decided before the
   * handler runs. Asserting the status is NOT 401 pins the whole of what this
   * test is about.
   *
   * **What it no longer covers, and why that is deliberate.** It used to assert
   * §5.7's counts. That did two bad things. It made an AUTH test drive the full
   * refresh loop, which calls Discogs once per refreshable record — four live
   * requests per E2E run, stopped only by the guard in `no-live-calls.ts`.
   * CLAUDE.md §2 says never allow a test to make a live external call; this
   * test allowed it and something else stopped it, which is a rule held by a
   * backstop rather than by the code.
   *
   * And the counts assertion could not fail: `expect.any(Number)` passes on
   * `failed: 4`, which is what was actually happening — so it could not tell a
   * healthy refresh from a totally failed one.
   *
   * **Narrowing loses no coverage**, because §5.7's counts are covered properly
   * in `test/integration/api/refresh-prices.test.ts`, which mocks the client
   * module and pins each outcome separately. That file explains why auth is not
   * tested there and names THIS spec as where it lives — the two are a pair,
   * and this end is the auth end.
   *
   * **Do not widen this back to a POST that asserts the body.** A second,
   * weaker assertion of a contract already tested there is what created the
   * problem above — and the POST is what made the live calls.
   */
  /*
    405 is the positive result: middleware admitted the request and the route
    had no GET handler. 401 would mean the secret was rejected.
  */
  expect(
    response.status(),
    'the secret must be admitted — 401 means middleware rejected it',
  ).toBe(405);
});
