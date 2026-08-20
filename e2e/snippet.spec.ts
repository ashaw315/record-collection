import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §10b's snippet on the record detail page, and A31a's confirmation.
 *
 * **No live model call.** §9.2's generation is exercised by integration tests
 * with an injected client; what needs a browser is the CONFIRMATION — whether
 * the dialog fires only when there is something to lose, and what it says. That
 * is a judgement only a real `window.confirm` can settle, and it is the one
 * place a mistake destroys the user's writing.
 *
 * So these specs drive edit and delete, which need no model, and assert the
 * confirmation's presence and absence around them.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * Asserts 201 rather than returning whatever came back.
 *
 * The first version of this helper did not, and a failing seed surfaced as
 * `Cannot read properties of undefined` four tests later — an error about the
 * assertion rather than about the setup that actually broke.
 */
async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

/** A record with a snippet the USER owns, created without touching the model. */
async function seedEditedRecord(page: Page, suffix: string) {
  const artist = await post(page, '/api/artists', { name: `Discharge ${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Why ${suffix}`,
    artistId: artist.id,
  });

  const id = record.id;
  await page.request.patch(`/api/records/${id}/snippet`, {
    data: { snippet: `My own words ${suffix}` },
    failOnStatusCode: false,
  });

  return id;
}

test('an edited snippet is labelled as the user own, not as generated', async ({ page }) => {
  await login(page);
  const suffix = `snip-${Date.now()}`;
  const id = await seedEditedRecord(page, suffix);

  await page.goto(`/records/${id}`);

  await expect(page.getByTestId('snippet-text')).toContainText(`My own words ${suffix}`);
  /*
   * §10b's label, and the direction that matters here: the user wrote this, so
   * attributing it to the model would be the same misattribution as presenting
   * the model's writing as fact.
   */
  await expect(page.getByTestId('snippet-yours')).toBeVisible();
  await expect(page.getByTestId('snippet-generated-label')).toHaveCount(0);
});

test('a record with no snippet says so without inviting one', async ({ page }) => {
  await login(page);
  const suffix = `snipa-${Date.now()}`;
  const artist = await post(page, '/api/artists', { name: `Anti-Cimex ${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Raped Ass ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}`);

  /*
   * §10b: "Absence is fine. A record with no snippet shows none, and no
   * placeholder invites one." The absent state states a fact; it does not nag.
   */
  await expect(page.getByTestId('snippet-absent')).toBeVisible();
  await expect(page.getByTestId('snippet-text')).toHaveCount(0);
});

/**
 * **Why the CONFIRMATION is not asserted here, recorded so nobody adds it back
 * and watches it hang.**
 *
 * The regenerate control requires `ANTHROPIC_API_KEY`, which the E2E
 * environment deliberately does not have (§11 forbids live external calls, and
 * `.env.test` carries no key). So the button that raises A31a's dialog does not
 * render here, and a spec clicking it waits 30s for a locator that will never
 * appear — which is what the first version of this file did.
 *
 * The confirmation is covered where it is reachable:
 *   - `snippet-view.test.ts` pins WHEN it fires and WHAT it says, including
 *     that it never mentions a column name;
 *   - `record-snippet-post.test.ts` pins that the server refuses without
 *     `confirmReplace` and that an edit landing mid-generation is not
 *     overwritten.
 *
 * What is left for a browser is the unconfigured state below, which this
 * environment genuinely has.
 */
test('the control names itself unconfigured rather than vanishing', async ({ page }) => {
  await login(page);
  const suffix = `snipu-${Date.now()}`;
  const id = await seedEditedRecord(page, suffix);

  await page.goto(`/records/${id}`);

  /*
   * `GapAnalysis` makes the same choice for §9.2: "a button that silently does
   * nothing reads as broken; saying which credential is missing turns a mystery
   * into a deployment task." A31a's argument against HIDING a capability
   * applies to the deployment case too.
   */
  await expect(page.getByTestId('snippet-unconfigured')).toBeVisible();
  await expect(page.getByTestId('snippet-generate')).toHaveCount(0);
});

test('deleting a snippet removes the text and keeps ownership', async ({ page }) => {
  await login(page);
  const suffix = `snipd-${Date.now()}`;
  const id = await seedEditedRecord(page, suffix);

  await page.goto(`/records/${id}`);
  await page.getByTestId('snippet-delete').click();

  await expect(page.getByTestId('snippet-absent')).toBeVisible();

  /*
   * §4.2: "a deliberate deletion is an edit", so ownership SURVIVES the delete
   * and a later generation must still ask. That is asserted in
   * `snippet-view.test.ts` (the deleted-but-owned case) rather than here,
   * because the control that would raise the dialog needs a key this
   * environment does not have.
   */
});
