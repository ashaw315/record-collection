import { expect, test, type Page } from '@playwright/test';

/**
 * Asserts that the RUNNING E2E SERVER refuses live external calls.
 *
 * This spec exists because the repo-level version of it was worthless. It
 * asserted that `playwright.config.ts` starts the dev server with
 * `NODE_ENV=test` — which it does, and which Next then DISCARDS, forcing
 * NODE_ENV to "development" for `next dev`. The guard was inert in E2E, the
 * config test passed, and two live calls reached api.discogs.com before anyone
 * noticed. A test asserting a config file's text certifies a safety the running
 * system may not provide.
 *
 * So the assertion is made where it can be observed: against the server, by
 * driving a real endpoint and checking that no Discogs call was made.
 *
 * A debug route would have been easier and is the wrong answer — production
 * surface existing to prove something about tests, added to close a hole caused
 * by a test reaching production infrastructure.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/**
 * A release id NOTHING caches.
 *
 * The first version used 381756, which `discogs-prefill.spec.ts` seeds into
 * `discogs_cache` — so on a parallel run the release was FOUND, the guard was
 * never reached, and these specs failed for the opposite of the reason they
 * exist. The cross-spec fixture rule: an assertion about "nothing has cached
 * this" must use a value no other spec can cache.
 */
const UNCACHED_RELEASE = 999000111;

async function login(page: Page) {
  await page.goto('/login');

  // Waits for hydration before typing: this form is CONTROLLED, so a value
  // typed into the DOM before React attaches never reaches state and the submit
  // sees an empty password. See the note on the login page.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the server refuses to reach Discogs from an E2E run', async ({ page }) => {
  /**
   * A search that nothing has cached — §6 does not cache searches at all, so
   * this endpoint has no way to answer except by calling out. If the guard is
   * active the request fails upstream; if it is not, Discogs answers and the
   * test sees a 200.
   *
   * The catalog number is deliberately one no release carries: a live call
   * would still return 200 with zero results, so the STATUS is what
   * discriminates, not the body.
   */
  const response = await page.request.get(
    '/api/discogs/search?catno=NO-SUCH-CATALOG-NUMBER-XYZ-9999',
  );

  expect(
    response.status(),
    'a live call would answer 200 — the guard turns it into an upstream failure',
  ).toBe(502);

  const body = await response.json();
  expect(body.error.code).toBe('UPSTREAM_ERROR');
});

test('the release endpoint refuses too, which is where the leak happened', async ({ page }) => {
  // The specific path that broke the rule in step 7: a server component
  // fetching release detail, where a browser-level route stub is not in the
  // request path at all.
  const response = await page.request.get(`/api/discogs/release/${UNCACHED_RELEASE}`);

  expect(response.status()).toBe(502);
});

test('the record form degrades to blank rather than fetching', async ({ page }) => {
  /**
   * The end-to-end consequence, stated positively: §10 says the form must work
   * "blank for manual entry", so a refused prefill leaves a usable form and a
   * notice — not an error page, and not a form silently filled from live data.
   */
  await page.goto(`/records/new?discogsReleaseId=${UNCACHED_RELEASE}`);
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });

  await expect(page.getByTestId('prefill-failed')).toBeVisible();
  await expect(page.getByLabel('Title')).toHaveValue('');
});
