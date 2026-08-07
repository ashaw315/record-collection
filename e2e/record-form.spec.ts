import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §11 E2E flow 2: "Add a record manually, end to end, and see it in the
 * collection list" — plus the edit round trip, which is where §5.2's
 * absent-vs-null-vs-value semantics are actually exercised through a UI.
 *
 * Every fixture is scoped to its own run and its own artist. Specs run fully
 * parallel against one database, so a test that assumes what is on an
 * unfiltered page 1 assumes something no other spec is obliged to preserve
 * (NOTES.md, cross-spec fixture rule).
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** SPEC.md §11 flow 2. */
test('adds a record manually and finds it in the collection', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Discharge-${suffix}` });
  const label = await post(page, '/api/labels', { name: `Clay-${suffix}` });
  await post(page, '/api/genres', { name: `UK82-${suffix}` });
  const title = `Hear Nothing ${suffix}`;

  await page.goto('/records/new');

  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Artist').selectOption(artist.id);
  await page.getByLabel('Label').selectOption(label.id);
  await page.getByLabel('Release year').fill('1982');
  await page.getByLabel('Media condition').selectOption('VG+');
  await page.getByLabel('Paid').fill('24.50');

  await page.getByText(`UK82-${suffix}`).click();

  await page.getByRole('button', { name: 'Add record' }).click();

  // Lands on the new record's detail screen.
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('£24.50')).toBeVisible();

  // And it is in the collection — the "see it in the list" half of flow 2.
  await page.goto(`/?artistId=${artist.id}`);
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 });
});

test('reports a validation failure without losing what was typed', async ({ page }) => {
  /**
   * A form that clears itself on a rejected save is worse than one that does
   * not save at all — the user loses the typing AND the reason.
   */
  const suffix = makeSuffix();
  const title = `No Artist ${suffix}`;

  await page.goto('/records/new');
  await page.getByLabel('Title').fill(title);
  // No artist chosen: artistId is required by §5.2.
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/records\/new/);
  await expect(page.getByLabel('Title')).toHaveValue(title);
});

test('edits one field without disturbing the others', async ({ page }) => {
  /**
   * The absent-vs-value half of §5.2: fields the user did not touch must not be
   * sent, so they keep their stored values. A form that submits everything
   * would still pass this — but the clearing test below is what it fails.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Edit-${suffix}` });
  const label = await post(page, '/api/labels', { name: `EditLabel-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Before ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
    releaseYear: 1982,
    conditionMedia: 'VG+',
    purchasePrice: '24.50',
    notes: 'Original note.',
  });

  await page.goto(`/records/${record.id}/edit`);
  await page.getByLabel('Title').fill(`After ${suffix}`);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: `After ${suffix}` })).toBeVisible();

  // Everything untouched survived.
  await expect(page.getByText(`EditLabel-${suffix}`)).toBeVisible();
  await expect(page.getByText('£24.50')).toBeVisible();
  await expect(page.getByText('Original note.')).toBeVisible();
  await expect(page.getByText('VG+')).toBeVisible();
});

test('clearing a field removes it rather than leaving it set', async ({ page }) => {
  /**
   * THE DISTINCTION, end to end. Emptying a select must send an explicit null
   * — not omit the field, which would leave the old value in place and make the
   * clear silently fail.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Clear-${suffix}` });
  const label = await post(page, '/api/labels', { name: `ClearLabel-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Clearable ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
    purchasePrice: '9.99',
  });

  await page.goto(`/records/${record.id}/edit`);
  await expect(page.getByLabel('Label')).toHaveValue(label.id);

  await page.getByLabel('Label').selectOption('');
  await page.getByLabel('Paid').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByText(`ClearLabel-${suffix}`)).toHaveCount(0);
  await expect(page.getByText('Not recorded')).toBeVisible();
});

test('removing every genre clears them, rather than leaving them alone', async ({ page }) => {
  /**
   * The nested-array half: `[]` means REMOVE ALL and absent means LEAVE ALONE.
   * NOTES records this exact distinction as having caused silent data loss
   * once, via a `.default([])` in a schema.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Genres-${suffix}` });
  const genre = await post(page, '/api/genres', { name: `Removable-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Genred ${suffix}`,
    artistId: artist.id,
    genreIds: [genre.id],
  });

  await page.goto(`/records/${record.id}`);
  await expect(page.getByRole('link', { name: `Removable-${suffix}` })).toBeVisible();

  await page.goto(`/records/${record.id}/edit`);
  // Clicking the selected chip deselects it.
  await page.getByText(`Removable-${suffix}`).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByRole('link', { name: `Removable-${suffix}` })).toHaveCount(0);
});

test('saving an unchanged record returns without an error', async ({ page }) => {
  // buildPatchBody yields {} and the API rejects an empty body, so the form
  // navigates instead of sending a request it knows will fail.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Unchanged-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Untouched ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}/edit`);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: `Untouched ${suffix}` })).toBeVisible();

  /**
   * Scoped to the FORM's error, not any alert.
   *
   * `getByRole('alert')` also matches Next's route announcer, which exists
   * transiently during navigation — so the bare assertion failed while the app
   * was behaving correctly. Verified by reading the DOM once settled: zero
   * alerts. The auth spec documents the same trap.
   */
  await expect(page.getByText('Could not reach the server. Nothing was saved.')).toHaveCount(0);
  await expect(page.locator('[role="alert"].text-destructive')).toHaveCount(0);
});
