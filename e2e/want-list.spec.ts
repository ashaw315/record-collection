import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §11 E2E flow 5: "Add a want-list item, then mark it acquired, and
 * verify it appears in the collection and is flagged acquired in the want-list."
 *
 * That flow is the one that has to feel fast — it is what you do standing in a
 * shop having just bought the thing. §7.3 is what makes the second half
 * non-obvious: the want-list row is NOT deleted, it becomes history.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

/** Waits for the form to be interactive — see record-form.spec.ts. */
async function formReady(page: Page): Promise<void> {
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** SPEC.md §11 flow 5, end to end. */
test('adds a want-list item, marks it acquired, and keeps it as history', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Discharge-${suffix}` });
  const title = `Hear Nothing ${suffix}`;

  const item = await post(page, '/api/want-list', {
    title,
    artistId: artist.id,
    priority: 1,
    bestDigNotes: 'UK first press, Porky stamp',
    maxPrice: '40.00',
  });

  // It appears on the want list, with what the hunt is for.
  await page.goto('/want-list');
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('UK first press, Porky stamp')).toBeVisible();

  /**
   * Scoped to THIS run's row, not `.first()`.
   *
   * Specs run fully parallel against one database, so `.first()` picks
   * whichever item another spec happened to create — NOTES' cross-spec fixture
   * rule, met here on the first run of this test.
   */
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: 'Mark acquired' })
    .click();
  await formReady(page);
  await expect(page.getByLabel('Title')).toHaveValue(title);
  await expect(page.getByLabel('Artist', { exact: true })).toHaveValue(artist.id);

  await page.getByLabel('Paid').fill('24.50');
  await page.getByRole('button', { name: 'Add to collection' }).click();

  // It lands on the new record.
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('£24.50')).toBeVisible();

  // It is in the COLLECTION.
  await page.goto(`/?artistId=${artist.id}`);
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 });

  /**
   * §7.3: the want-list row was NOT deleted. It is gone from what is still
   * wanted, and present in acquisition history — a "clean up after yourself"
   * implementation would pass the first assertion and fail the second.
   */
  await page.goto('/want-list');
  await expect(page.getByText(title)).toHaveCount(0);

  await page.goto('/want-list?acquired=true');
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Acquired').first()).toBeVisible();

  // And the history entry links to what was acquired.
  const stored = await (await page.request.get(`/api/want-list/${item.id}`)).json();
  expect(stored.isAcquired).toBe(true);
  expect(stored.acquiredRecordId).not.toBeNull();
});

test('sorts by priority, highest first', async ({ page }) => {
  /**
   * §4.2: "1 = highest, 5 = lowest". Sorted the other way the screen is
   * useless at a glance — the thing you most want is at the bottom.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Sorted-${suffix}` });

  await post(page, '/api/want-list', {
    title: `Lowest ${suffix}`,
    artistId: artist.id,
    priority: 5,
  });
  await post(page, '/api/want-list', {
    title: `Highest ${suffix}`,
    artistId: artist.id,
    priority: 1,
  });

  await page.goto('/want-list');

  const rows = page.getByRole('listitem').filter({ hasText: suffix });
  await expect(rows.first()).toContainText(`Highest ${suffix}`, { timeout: 15_000 });
  // Named rather than numbered, so the reader knows which end is the top.
  await expect(rows.first()).toContainText('Highest');
});

test('shows the target pressing and best-dig notes on the row', async ({ page }) => {
  // §10: "Each row shows target pressing and best-dig notes."
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Pressing-${suffix}` });
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `CLAY-${suffix}`,
    countryPressed: 'UK',
    yearPressed: 1982,
  });

  await post(page, '/api/want-list', {
    title: `Targeted ${suffix}`,
    artistId: artist.id,
    targetPressingId: pressing.id,
    bestDigNotes: 'Matrix A1/B1, no barcode',
    maxPrice: '40.00',
  });

  await page.goto('/want-list');

  const row = page.getByRole('listitem').filter({ hasText: `Targeted ${suffix}` });
  await expect(row).toContainText(`CLAY-${suffix}`, { timeout: 15_000 });
  await expect(row).toContainText('Matrix A1/B1, no barcode');
});

test('never describes best dig as a price or a deal', async ({ page }) => {
  /**
   * CLAUDE.md §8, asserted on the rendered page rather than only in the unit
   * test: "best dig" means the highest-fidelity pressing worth hunting for, not
   * the cheapest or the best deal. The max price is the user's own ceiling and
   * must not read as an appraisal.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Copy-${suffix}` });
  await post(page, '/api/want-list', {
    title: `Copy Check ${suffix}`,
    artistId: artist.id,
    bestDigNotes: 'Original press',
    maxPrice: '30.00',
  });

  await page.goto('/want-list');
  const row = page.getByRole('listitem').filter({ hasText: `Copy Check ${suffix}` });
  await expect(row).toBeVisible({ timeout: 15_000 });

  const text = (await row.textContent()) ?? '';
  for (const forbidden of ['best deal', 'best price', 'market value', 'estimated value']) {
    expect(text.toLowerCase(), forbidden).not.toContain(forbidden);
  }
});

test('deleting an acquired item names what is lost and spares the record', async ({ page }) => {
  /**
   * §7.3: an explicit delete is permitted, but "the UI must make the
   * consequence legible before it happens — a confirmation naming what is
   * lost, not a bare delete button on an acquired row."
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Deletable-${suffix}` });
  const item = await post(page, '/api/want-list', {
    title: `Deletable ${suffix}`,
    artistId: artist.id,
  });

  const acquired = await page.request.post(`/api/want-list/${item.id}/acquire`, {
    data: { title: `Deletable ${suffix}`, artistId: artist.id },
    failOnStatusCode: false,
  });
  expect(acquired.status()).toBe(201);
  const record = await acquired.json();

  await page.goto('/want-list?acquired=true');
  const row = page.getByRole('listitem').filter({ hasText: `Deletable ${suffix}` });
  await row.getByRole('button', { name: 'Delete' }).click();

  // The confirmation says what is lost AND what is not.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/acquisition history/i);
  await expect(dialog).toContainText(/not affected|stays in your collection/i);

  await page.getByTestId('confirm-delete').click();

  // The record survives: acquired_record_id points want-list to record, never
  // the reverse (§7.3).
  await expect
    .poll(async () => (await page.request.get(`/api/records/${record.id}`)).status(), {
      timeout: 15_000,
    })
    .toBe(200);
});
