import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §10 `/records/:id`.
 *
 * Every fixture here is scoped to its own run and its own artist. Specs run
 * fully parallel against one database, so a test that assumes what is on an
 * unfiltered page 1 — or that its title is unique — is assuming something no
 * other spec is obliged to preserve. That cost three separate defects in unit
 * 7d.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `d${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('shows every recorded field, and omits what is absent', async ({ page }) => {
  const suffix = makeSuffix();

  const artist = await post(page, '/api/artists', { name: `Discharge-${suffix}` });
  const label = await post(page, '/api/labels', { name: `Clay-${suffix}` });
  const store = await post(page, '/api/stores', { name: `Amoeba-${suffix}` });
  const genre = await post(page, '/api/genres', { name: `UK82-${suffix}` });
  const tag = await post(page, '/api/tags', { name: `signed-${suffix}` });
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `CLAY-LP-3-${suffix}`,
    matrixRunout: `CLAYLP3-A1-${suffix}`,
    pressingPlant: 'Damont',
    yearPressed: 1982,
    countryPressed: 'UK',
    vinylWeightGrams: 180,
  });

  const record = await post(page, '/api/records', {
    title: `Hear Nothing ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
    storeId: store.id,
    pressingId: pressing.id,
    releaseYear: 1982,
    conditionMedia: 'VG+',
    conditionSleeve: 'VG',
    purchasePrice: '24.50',
    purchaseDate: '2024-03-01',
    notes: 'First pressing, bought in person.',
    genreIds: [genre.id],
    tagIds: [tag.id],
  });

  await page.goto(`/records/${record.id}`);

  await expect(page.getByRole('heading', { name: `Hear Nothing ${suffix}` })).toBeVisible();
  await expect(page.getByRole('link', { name: `Discharge-${suffix}` })).toBeVisible();

  // The identifiers that decide WHICH pressing this is (CLAUDE.md §8).
  await expect(page.getByText(`CLAY-LP-3-${suffix}`)).toBeVisible();
  await expect(page.getByText(`CLAYLP3-A1-${suffix}`)).toBeVisible();
  await expect(page.getByText('Damont')).toBeVisible();
  await expect(page.getByText('180 g')).toBeVisible();

  await expect(page.getByText('£24.50')).toBeVisible();
  await expect(page.getByText('First pressing, bought in person.')).toBeVisible();

  // is_reissue defaults false, and only the true case earns a row.
  await expect(page.getByText('Reissue')).toHaveCount(0);
});

test('renders a record that has only the required fields', async ({ page }) => {
  /**
   * §10 names the primary mobile case as quick in-store entry, and §4.2 makes
   * almost everything nullable for it. A detail screen that assumes a fully
   * populated record breaks on exactly the records the app is designed to
   * accept fastest.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Sparse-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Bare ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}`);

  await expect(page.getByRole('heading', { name: `Bare ${suffix}` })).toBeVisible();
  await expect(page.getByText('Not graded').first()).toBeVisible();
  await expect(page.getByText('Not recorded')).toBeVisible();

  // No pressing, so no Pressing section at all rather than an empty one.
  await expect(page.getByRole('heading', { name: 'Pressing' })).toHaveCount(0);
  // Nor sections for the parts that are not built yet (steps 8 and 9).
  await expect(page.getByRole('heading', { name: 'Images' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Journal' })).toHaveCount(0);
});

test('a genre link returns to the collection filtered by it', async ({ page }) => {
  // The detail screen's links are the reason to file a record under anything:
  // "what else is like this" has to be one click.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Linked-${suffix}` });
  const genre = await post(page, '/api/genres', { name: `Crust-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Linked Record ${suffix}`,
    artistId: artist.id,
    genreIds: [genre.id],
  });

  await page.goto(`/records/${record.id}`);
  await page.getByRole('link', { name: `Crust-${suffix}` }).click();

  await expect(page).toHaveURL(new RegExp(`genreId=${genre.id}`), { timeout: 15_000 });
  await expect(page.getByRole('link', { name: `Linked Record ${suffix}` })).toBeVisible({
    timeout: 15_000,
  });
});

test('a missing record is a not-found page, not a server error', async ({ page }) => {
  // A well-formed id that does not exist.
  const response = await page.goto('/records/00000000-0000-4000-8000-000000000000');

  expect(response?.status()).toBe(404);
});

test('a malformed id is a not-found page rather than a cast error', async ({ page }) => {
  /**
   * Without the guard this reaches Postgres, fails the uuid cast and surfaces
   * as a 500 — a blank screen for what is really a stale link. The §5.2
   * endpoint returns 400 for the same input, deliberately: a caller sending
   * nonsense should be told, a person following a dead link should be shown
   * the not-found page.
   */
  const response = await page.goto('/records/not-a-uuid');

  expect(response?.status()).toBe(404);
});

test('reaches the detail screen from the collection list', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Nav-${suffix}` });
  await post(page, '/api/records', { title: `Navigable ${suffix}`, artistId: artist.id });

  // Scoped to this run's artist: another spec's fixtures may be on page 1.
  const artists = await (await page.request.get('/api/artists?pageSize=200')).json();
  const mine = artists.data.find((row: { name: string }) => row.name === `Nav-${suffix}`);

  await page.goto(`/?artistId=${mine.id}`);
  await page.getByRole('link', { name: `Navigable ${suffix}` }).click();

  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: `Navigable ${suffix}` })).toBeVisible();
});
