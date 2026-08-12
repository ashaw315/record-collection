import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §5.2's routing note: `app/api/records/stats/route.ts` is a STATIC
 * segment and must not be swallowed by `app/api/records/[id]/route.ts`.
 *
 * This is an E2E test rather than an integration one because route precedence
 * is a property of the Next.js ROUTER, and the router is only involved when a
 * real HTTP request is dispatched. The integration test that used to claim this
 * coverage imported the `[id]` handler and called it with a hand-made
 * `{ id: 'stats' }` param — which exercises the handler's UUID guard and tells
 * you nothing about which handler Next would have chosen. It was mutation-
 * verified as duplicating a guard test that already exists in
 * records-update.test.ts.
 *
 * Only a request over the wire can distinguish "static resolved first" from
 * "dynamic swallowed it".
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

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

test('GET /api/records/stats reaches the static segment, not [id]', async ({ page }) => {
  const response = await page.request.get('/api/records/stats', { failOnStatusCode: false });

  expect(response.status()).toBe(200);

  const body = await response.json();

  // The stats shape (§5.2), which the [id] handler could never return. A 400
  // here would mean 'stats' was parsed as an :id.
  expect(body).toHaveProperty('totalRecords');
  expect(body).toHaveProperty('byGenre');
  expect(body).not.toHaveProperty('error');
});

test('GET /api/records/<non-uuid> is rejected by the dynamic route', async ({ page }) => {
  // The other half of the note: [id] must reject a non-UUID with 400 rather
  // than attempting a lookup and surfacing a Postgres cast error as a 500.
  const response = await page.request.get('/api/records/not-a-uuid', {
    failOnStatusCode: false,
  });

  expect(response.status()).toBe(400);
  expect((await response.json()).error.code).toBe('INVALID_ID');
});
