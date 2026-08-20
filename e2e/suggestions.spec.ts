import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §11, E2E flow #8: "Request relationship-based suggestions and add one
 * to the want-list."
 *
 * Both halves matter and they fail differently. The list must render §9.1's
 * reason clauses — a bare ranked list of names is the "never return a bare score
 * with no reasoning" case — and the add must actually land a `want_list` row,
 * not merely open something.
 *
 * **`/suggestions` has no header link, by decision** (NOTES, step 14 unit 3).
 * At 390px the nav already hides two of its five links, so a sixth makes a
 * measured problem worse. It is reached from `/want-list`, which is where its
 * output lands. That is why this spec navigates via the want list rather than
 * via the nav — the route to the screen IS part of the flow.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

/**
 * An owned artist, a candidate linked to it, and one record so the artist counts
 * as owned. Built through the API rather than by seeding the database, so the
 * flow exercises the same writes a user's would.
 */
async function seedASuggestion(page: Page, suffix: string) {
  const owned = await post(page, '/api/artists', { name: `Discharge ${suffix}` });
  const candidate = await post(page, '/api/artists', { name: `Anti-Cimex ${suffix}` });

  await post(page, '/api/records', {
    title: `Hear Nothing ${suffix}`,
    artistId: owned.id,
  });

  // §5.5: POST /api/influences carries the pair in the body.
  await post(page, '/api/influences', {
    sourceArtistId: candidate.id,
    targetArtistId: owned.id,
    strength: 4,
  });

  return { owned, candidate };
}

test('flow 8: request suggestions and add one to the want list', async ({ page }) => {
  await login(page);
  const suffix = `s8-${Date.now()}`;
  const { candidate } = await seedASuggestion(page, suffix);

  // The route into the screen is part of the flow: no nav link exists.
  await page.goto('/want-list');
  await page.getByRole('link', { name: /suggestions/i }).click();
  await expect(page).toHaveURL('/suggestions');

  const row = page.getByRole('listitem').filter({ hasText: `Anti-Cimex ${suffix}` });
  await expect(row).toBeVisible();

  /**
   * The REASON, not merely the name. §9.1: "Suggestions must be explainable.
   * Never return a bare score with no reasoning." A list that rendered names
   * and scores would pass a visibility check and fail the requirement.
   */
  await expect(row).toContainText(/linked to 1 artist you own/i);

  await row.getByRole('link', { name: /add to want list/i }).click();

  /**
   * The artist is prefilled and the title is NOT. §9.1 suggests artists;
   * `want_list.title` is NOT NULL because the want list holds records. Inventing
   * a title would be the placeholder-as-real-data shape, so the user supplies
   * it — which is why this flow types one.
   */
  await expect(page).toHaveURL(new RegExp(`/want-list/new\\?.*artistId=${candidate.id}`));
  await expect(page.getByLabel('Artist')).toHaveValue(candidate.id);

  // The context line, regenerated server-side rather than passed through the URL.
  await expect(page.getByText(/linked to 1 artist you own/i)).toBeVisible();

  await page.getByLabel('Title').pressSequentially(`Raped Ass ${suffix}`);
  await page.getByRole('button', { name: /save|add/i }).click();

  // The row LANDED, which is the half a navigation assertion would miss.
  await expect(page).toHaveURL('/want-list');
  await expect(page.getByText(`Raped Ass ${suffix}`)).toBeVisible();
  await expect(page.getByText(`Anti-Cimex ${suffix}`).first()).toBeVisible();
});

test('a suggestion already on the want list says so rather than vanishing', async ({ page }) => {
  await login(page);
  const suffix = `s8sup-${Date.now()}`;
  const { candidate } = await seedASuggestion(page, suffix);

  await post(page, '/api/want-list', {
    title: `Raped Ass ${suffix}`,
    artistId: candidate.id,
  });

  await page.goto('/suggestions');

  /**
   * §9.1: "suppress, don't hide". The candidate keeps its row with a reduced
   * score and says why. A user who cannot see it has no way to learn that the
   * thing they were about to add is already there.
   */
  const row = page.getByRole('listitem').filter({ hasText: `Anti-Cimex ${suffix}` });
  await expect(row).toBeVisible();
  await expect(row).toContainText(/already on your want list/i);
});

test('an artist with no link to the collection is not suggested', async ({ page }) => {
  await login(page);
  const suffix = `s8none-${Date.now()}`;

  /**
   * A stranger: an artist with no influence edge and no shared membership. It
   * must NOT appear, and the assertion is specific to this artist rather than
   * about the list being empty — this suite shares one database, so other specs'
   * linked artists are legitimately present and an emptiness assertion would be
   * testing their absence rather than this artist's.
   *
   * **This is the vacuity guard for the two tests above.** They assert a
   * suggestion IS listed; without this, a screen that listed every artist in the
   * database would pass both. The genuinely-empty case belongs to the unit
   * tests, which own a truncated database and can assert `[]` honestly.
   */
  const stranger = await post(page, '/api/artists', { name: `Nobody ${suffix}` });

  await page.goto('/suggestions');

  await expect(page.getByRole('heading', { name: /suggestions/i })).toBeVisible();
  await expect(page.getByText(`Nobody ${suffix}`)).toHaveCount(0);
  expect(stranger.id).toBeTruthy();
});
