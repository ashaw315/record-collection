import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §10 `/stats`: "Total records, total spend, estimated value, breakdown
 * charts by genre/decade/store/label."
 *
 * **The §7.6 hazard is what this screen is built around**, not captioned with.
 * One record legitimately shows two different prices — the detail screen shows
 * the latest of any type, while estimated value uses the most recent `used`
 * price falling back to `new`, then purchase price. A bare figure is a number
 * people quote back having not read the explanation, so the figure and its
 * meaning are one sentence.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

function makeSuffix(): string {
  return `s${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the estimated value says what it sums in the same breath as the number', async ({ page }) => {
  /**
   * The recorded hazard, addressed structurally: the figure never appears
   * without the rule that produced it.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Stats-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Valued ${suffix}`,
    artistId: artist.id,
    purchasePrice: '12.00',
  });
  await page.request.post(`/api/records/${record.id}/prices`, {
    data: { price: '40.00', priceType: 'used' },
  });

  await page.goto('/stats');

  const value = page.getByTestId('estimated-value');
  await expect(value).toContainText(/most recent second-hand price/i);
  await expect(value, 'the whole fallback chain, not just its first link').toContainText(/new/i);
  await expect(value).toContainText(/what you paid/i);
  await expect(value).toContainText(/estimate/i);

  // CLAUDE.md §8: "best dig" is a pressing, never a price. This is the copy
  // where conflating them would be most expensive.
  await expect(value).not.toContainText(/best dig/i);
});

test('spend and value are distinguishable, not readable as profit', async ({ page }) => {
  /**
   * They sit side by side and are easily conflated. Spend is a FACT from
   * `purchase_price`; value is an estimate. Only the wording carries that.
   *
   * Seeds its own priced record rather than assuming the shared database has
   * one. A first version asserted "paid" unconditionally and was intermittently
   * right — when no spend was recorded the copy correctly read "No purchase
   * prices recorded yet", and the test failed for saying something true.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Spend-${suffix}` });
  await post(page, '/api/records', {
    title: `Spent ${suffix}`,
    artistId: artist.id,
    purchasePrice: '20.00',
  });

  await page.goto('/stats');

  await expect(page.getByTestId('total-spend')).toContainText(/paid/i);
  await expect(page.getByTestId('total-spend'), 'spend is never an estimate').not.toContainText(
    /estimate/i,
  );
});

test('breaks the collection down by genre, decade, store and label', async ({ page }) => {
  // §10 names all four. byLabel was in the response shape and missing from the
  // query until this unit.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Break-${suffix}` });
  const genre = await post(page, '/api/genres', { name: `UK82-${suffix}` });
  const label = await post(page, '/api/labels', { name: `Clay-${suffix}` });
  const store = await post(page, '/api/stores', { name: `Shop-${suffix}` });

  await post(page, '/api/records', {
    title: `Broken Down ${suffix}`,
    artistId: artist.id,
    genreIds: [genre.id],
    labelId: label.id,
    storeId: store.id,
    releaseYear: 1982,
    purchasePrice: '20.00',
  });

  await page.goto('/stats');

  await expect(page.getByTestId('by-genre')).toContainText(`UK82-${suffix}`);
  await expect(page.getByTestId('by-label')).toContainText(`Clay-${suffix}`);
  await expect(page.getByTestId('by-store')).toContainText(`Shop-${suffix}`);
  await expect(page.getByTestId('by-decade')).toContainText('1980s');
});

/**
 * **The zero branch is NOT tested here, deliberately.**
 *
 * It needs a collection with no priced records, and this database is shared and
 * written concurrently by every spec. A first version guarded with
 * `test.skip(estimatedValue > 0)` and still failed intermittently: the guard
 * read the total, then ANOTHER test in this same file seeded a priced record
 * before the assertion ran. A check-then-act race between two of my own tests.
 *
 * `value-statement.test.ts` covers both branches directly and can, because it
 * calls the function with the value it chooses. Retrying this here would only
 * make the race less frequent, not absent — and a test that is usually right
 * about shared state is worse than no test, because it teaches you to re-run.
 */

test('the stats screen is reachable from the nav, not only by URL', async ({ page }) => {
  /**
   * A screen nothing links to is the unreachable-path shape that left §6's
   * genre mapping implemented, tested and never executed (NOTES). Routable is
   * not the same as reachable.
   */
  await page.goto('/');
  await page.getByRole('navigation').getByRole('link', { name: 'Stats' }).click();

  await expect(page).toHaveURL(/\/stats$/);
  await expect(page.getByRole('heading', { name: 'Stats', level: 1 })).toBeVisible();
});

test('a breakdown row opens the collection filtered by it', async ({ page }) => {
  // A breakdown is only useful if you can open what it counts.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Clickable-${suffix}` });
  const label = await post(page, '/api/labels', { name: `Rough-${suffix}` });
  await post(page, '/api/records', {
    title: `Clickable ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
  });

  await page.goto('/stats');
  await page.getByTestId('by-label').getByRole('link', { name: `Rough-${suffix}` }).click();

  await expect(page).toHaveURL(new RegExp(`labelId=${label.id}`), { timeout: 15_000 });
  await expect(page.getByRole('link', { name: `Clickable ${suffix}` })).toBeVisible({
    timeout: 15_000,
  });
});
