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

  // Waits for hydration before typing: this form is CONTROLLED, so a value
  // typed into the DOM before React attaches never reaches state and the submit
  // sees an empty password. See the note on the login page.
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
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

  await expect(page.getByText('$24.50')).toBeVisible();
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
  /**
   * The gallery is PRESENT with no images, unlike Pressing above — and the
   * difference is deliberate. A pressing section with nothing in it would
   * assert facts that do not exist; the gallery is also the upload control, so
   * hiding it on a record with no images would leave no way to add the first
   * one. It says so instead of rendering blank.
   *
   * This line asserted `toHaveCount(0)` until step 8, as a placeholder for
   * "not built yet". Kept as a real assertion rather than deleted.
   */
  await expect(page.getByRole('heading', { name: 'Images' })).toHaveCount(1);
  await expect(page.getByTestId('image-gallery')).toContainText('No images yet');

  /**
   * The journal is PRESENT with no entries, for the same reason the gallery is:
   * it carries the add-entry form, so hiding it on a record with no entries
   * would leave no way to write the first one.
   *
   * This asserted `toHaveCount(0)` until step 9, as a placeholder for "not
   * built yet" — a dated claim, and the second one this file has carried. Kept
   * as a real assertion rather than deleted.
   */
  await expect(page.getByRole('heading', { name: 'Journal' })).toHaveCount(1);
  await expect(page.getByTestId('journal')).toContainText('No entries yet');
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

test('deleting a record names what is lost, then returns to the collection', async ({ page }) => {
  /**
   * §5.2's DELETE endpoint has existed since step 5 with no UI. §7.3's
   * precedent governs the confirmation: "the UI must make the consequence
   * legible before it happens — a confirmation naming what is lost, not a bare
   * delete button".
   *
   * A record cascades more than a want-list entry does: images, journal entries
   * and price history (§4.2). The purchase price, date and store are
   * hand-entered and unrecoverable, which is the loss people actually regret.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Deletable-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Deletable ${suffix}`,
    artistId: artist.id,
    purchasePrice: '24.50',
  });

  await page.goto(`/records/${record.id}`);

  await page.getByRole('button', { name: 'Delete record' }).click();

  const dialog = page.getByRole('dialog');
  await expect(dialog, 'the title names the record, not "this item"').toContainText(
    `Deletable ${suffix}`,
  );
  await expect(dialog, 'the purchase details are named — they are unrecoverable').toContainText(
    /purchase price, date and store/i,
  );
  await expect(dialog).toContainText(/cannot be undone/i);

  await page.getByTestId('confirm-delete').click();

  // Back to the collection, not a 404 on a record that no longer exists.
  await expect(page).toHaveURL(/\/$|\/\?/, { timeout: 15_000 });
  await expect(page.getByText(`Deletable ${suffix}`)).toHaveCount(0);
});

test('a cancelled delete deletes nothing', async ({ page }) => {
  // The other half: the confirmation above passes equally well against a
  // dialog whose Cancel also deletes.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Kept-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Kept ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}`);
  await page.getByRole('button', { name: 'Delete record' }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}`));
  // `exact`: the dialog title also contains the record title, so a substring
  // match resolves to two headings and fails as a strict-mode violation —
  // which reads as "not visible" rather than "found two".
  await expect(
    page.getByRole('heading', { name: `Kept ${suffix}`, exact: true }),
  ).toBeVisible();
});

test('a record fulfilling a want-list entry says WHY it cannot be deleted', async ({ page }) => {
  /**
   * §5.2 returns `409 IN_USE` when `want_list.acquired_record_id` references
   * the record. A generic "could not delete" would leave the user with no idea
   * why and nothing to act on — the reason is specific, so the message is.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Fulfils-${suffix}` });
  const item = await post(page, '/api/want-list', {
    title: `Fulfils ${suffix}`,
    artistId: artist.id,
  });

  const acquired = await page.request.post(`/api/want-list/${item.id}/acquire`, {
    data: { title: `Fulfils ${suffix}`, artistId: artist.id },
    failOnStatusCode: false,
  });
  expect(acquired.status()).toBe(201);
  const record = await acquired.json();

  await page.goto(`/records/${record.id}`);
  await page.getByRole('button', { name: 'Delete record' }).click();
  await page.getByTestId('confirm-delete').click();

  // Scoped to main: Next renders a route announcer with role="alert" too, so
  // an unscoped query is a strict-mode violation that reads as absence.
  await expect(page.locator('main').getByRole('alert')).toContainText(/want[- ]list/i);
  // And it is still here — a refused delete must not look like a successful one.
  await expect(page).toHaveURL(new RegExp(`/records/${record.id}`));
});

test('the journal records what happened, newest first', async ({ page }) => {
  /**
   * §10: the record detail carries "journal entries with add-entry form".
   * §5.2's endpoints landed in unit 1; this is the screen that reaches them.
   *
   * Newest first, matching the hydrated read's `entry_date DESC`: the last
   * thing you thought about a record is what you want to see.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Journal-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Journal ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}`);
  // Controlled inputs: a value typed before React attaches never reaches state,
  // so the note submits empty. Same marker as the record form and login page.
  await page.locator('[data-testid="journal-form"][data-hydrated="true"]').waitFor({
    timeout: 15_000,
  });

  // The empty state says what the journal is FOR rather than showing nothing.
  await expect(page.getByTestId('journal')).toContainText(/no entries|nothing yet/i);

  await page.getByLabel('Journal note').fill('Played it after the pub. Still loud.');
  await page.getByRole('button', { name: 'Add entry' }).click();

  await expect(page.getByTestId('journal-entry')).toHaveCount(1, { timeout: 15_000 });
  await expect(page.getByTestId('journal')).toContainText('Still loud');

  // A second entry, backdated — "I played this last Tuesday" is the normal case.
  await page.getByLabel('Entry date').fill('2026-01-05');
  await page.getByLabel('Journal note').fill('First listen, cold morning.');
  await page.getByRole('button', { name: 'Add entry' }).click();

  await expect(page.getByTestId('journal-entry')).toHaveCount(2, { timeout: 15_000 });

  const notes = await page.getByTestId('journal-entry').allInnerTexts();
  expect(notes[0], "today's entry leads, not January's").toContain('Still loud');
});

test('the entry date defaults to today and refuses a typo', async ({ page }) => {
  /**
   * §5.2: "`entryDate` defaults to today". Bounded to 1877–today, because
   * `1823-04-11` is a real day and a typo — the calendar check that rejects
   * `2026-13-45` cannot see it.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Dated-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Dated ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}`);

  /**
   * Today read from the BROWSER, not computed in the test process.
   *
   * The two can differ by a day either side of midnight — the page computes its
   * default in the browser's clock, and a locally-computed comparison would
   * fail at 23:59 for reasons having nothing to do with the code. Same hazard
   * as the endpoint test comparing against the database's `CURRENT_DATE`.
   */
  const today = await page.evaluate(() => new Date().toISOString().slice(0, 10));

  // Prefilled, so the common case is one field and a button.
  await expect(page.getByLabel('Entry date')).toHaveValue(today);

  // The input itself refuses out-of-range dates, so the server never sees them.
  await expect(page.getByLabel('Entry date')).toHaveAttribute('min', '1877-01-01');
  await expect(page.getByLabel('Entry date')).toHaveAttribute('max', today);
});

test('deleting an entry leaves the record alone', async ({ page }) => {
  // §4.2 cascades entries when a RECORD goes; nothing cascades the other way.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Undelete-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Undelete ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}`);
  await page.locator('[data-testid="journal-form"][data-hydrated="true"]').waitFor({
    timeout: 15_000,
  });
  await page.getByLabel('Journal note').fill('a note to remove');
  await page.getByRole('button', { name: 'Add entry' }).click();
  await expect(page.getByTestId('journal-entry')).toHaveCount(1, { timeout: 15_000 });

  page.on('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: /Delete this entry/i }).click();

  await expect(page.getByTestId('journal-entry')).toHaveCount(0, { timeout: 15_000 });
  await expect(
    page.getByRole('heading', { name: `Undelete ${suffix}`, exact: true }),
    'the record survives its note',
  ).toBeVisible();
});

test('prices accumulate as observations and the sparkline states its bounds', async ({ page }) => {
  /**
   * §10's "price history sparkline", and §7.5's append-only rule made visible.
   *
   * The bounds are stated in WORDS beside the shape: a sparkline shows the
   * trend and says nothing about scale, so a chart without them is decoration.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Priced-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Priced ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}`);
  await page.locator('[data-testid="price-form"][data-hydrated="true"]').waitFor({
    timeout: 15_000,
  });

  // Empty state says what the section is for rather than showing a blank chart.
  await expect(page.getByTestId('price-history')).toContainText(/no prices recorded/i);
  await expect(page.getByTestId('sparkline')).toHaveCount(0);

  await page.getByLabel('Price', { exact: true }).fill('20.00');
  await page.getByRole('button', { name: 'Add price' }).click();
  await expect(page.getByTestId('sparkline')).toHaveCount(1, { timeout: 15_000 });

  await page.getByLabel('Price', { exact: true }).fill('35.50');
  await page.getByRole('button', { name: 'Add price' }).click();

  // BOTH survive: §7.5 appends, never replaces.
  await expect(page.getByTestId('price-range')).toContainText('2 observations', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('price-range')).toContainText('$20.00');
  await expect(page.getByTestId('price-range')).toContainText('$35.50');
});

test('the price section offers no way to edit an observation', async ({ page }) => {
  /**
   * §7.5 is append-only, so an edit control would promise something the
   * endpoint refuses. Asserted rather than assumed: the absence is the design,
   * and the copy says so in case the absence reads as an oversight.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `NoEdit-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `NoEdit ${suffix}`,
    artistId: artist.id,
  });
  await page.request.post(`/api/records/${record.id}/prices`, {
    data: { price: '24.50', priceType: 'used' },
  });

  await page.goto(`/records/${record.id}`);

  const section = page.getByTestId('price-history');
  await expect(section).toContainText(/added, never edited/i);
  await expect(section.getByRole('button', { name: /edit/i })).toHaveCount(0);
});

test('a rejected price says what is wrong and records nothing', async ({ page }) => {
  // The coercion class at a money boundary: '5e4' is 50000 to a naive parse.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `BadPrice-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `BadPrice ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}`);
  await page.locator('[data-testid="price-form"][data-hydrated="true"]').waitFor({
    timeout: 15_000,
  });

  await page.getByLabel('Price', { exact: true }).fill('5e4');
  await page.getByRole('button', { name: 'Add price' }).click();

  await expect(page.getByTestId('price-history').getByRole('alert')).toBeVisible();
  await expect(page.getByTestId('sparkline')).toHaveCount(0);
});

test('each price shows its date and what its type means', async ({ page }) => {
  /**
   * QA, step 9: the sparkline plots by time and the reader could not see the
   * times. "3 observations, $8.00 to $120.00" cannot say whether the $120 was
   * last week or three years ago, nor which observation was new or used.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Dated-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Dated Prices ${suffix}`,
    artistId: artist.id,
  });

  for (const [price, priceType] of [
    ['8.00', 'used'],
    ['120.00', 'asking'],
  ] as const) {
    const response = await page.request.post(`/api/records/${record.id}/prices`, {
      data: { price, priceType },
    });
    expect(response.status()).toBe(201);
  }

  await page.goto(`/records/${record.id}`);

  const observations = page.getByTestId('price-observation');
  await expect(observations).toHaveCount(2);

  const text = (await observations.allInnerTexts()).join('\n');

  // The dates, which is the finding.
  expect(text).toMatch(/\d{4}-\d{2}-\d{2}/);

  /**
   * The type EXPLAINED, not labelled. "Asking" alone does not say nobody paid
   * it — the same reasoning as the estimated-value sentence, and the same field
   * where `best_dig` once produced "$120.00 best dig".
   */
  expect(text).toMatch(/nobody paid this/i);
  expect(text).toMatch(/second-hand copy sold for/i);
  expect(text.toLowerCase()).not.toContain('best dig');
});
