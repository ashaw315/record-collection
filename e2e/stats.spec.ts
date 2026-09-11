import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';

/* Records and artists removed after each test — see e2e/cleanup.ts. */
registerCleanup();

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
  trackArtist(artist.id as string);
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
  trackArtist(artist.id as string);
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
  trackArtist(artist.id as string);
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
  trackArtist(artist.id as string);
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

/**
 * **The empty collection, which nothing had ever rendered** — not a test, not a
 * browser. §7a: *a zero keeps display and takes muted — a figure that covers
 * nothing is still a figure.*
 *
 * **Scoped with `?artistId=` rather than emptied globally.** `/stats` showed the
 * whole collection and took no parameters, so "empty" would have meant an empty
 * DATABASE — and `e2e/global-setup.ts` says why that is not available: specs run
 * in parallel across two projects against one database, so a mid-run truncate
 * deletes another spec's fixtures. That is the defect NOTES records as 52 bogus
 * E2E failures. `/plane` already solved this, and this follows its shape rather
 * than inventing one: an artist with no records is an empty collection of one.
 *
 * **Asserted on COMPUTED STYLE, not on class names.** A class assertion passes
 * when the class stops generating a rule — `border-l-dashed` shipped exactly
 * that way and rendered the state at 1.29:1. The browser is here, so the
 * rendered pixel size and colour are readable, and they are what the reader
 * sees.
 */
test('an empty collection renders its zero rather than hiding it', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Empty-${suffix}` });
  trackArtist(artist.id as string);

  /*
    **A SECOND artist with a record, so the scope is doing work.**

    Without this the assertions below pass on an empty database for the wrong
    reason — the collection is globally empty, `0` renders whatever the filter
    does, and the test would pass against a `/stats` that ignores `artistId`
    entirely. Measured: it did exactly that before the parameter existed.

    With a record present, `0` is only reachable if the scope is applied.
  */
  const other = await post(page, '/api/artists', { name: `Stocked-${suffix}` });
  trackArtist(other.id as string);
  await post(page, '/api/records', { title: `Stocked ${suffix}`, artistId: other.id });

  await page.goto(`/stats?artistId=${artist.id}`);

  const count = page.getByTestId('total-records');
  await expect(count, 'the zero is rendered, not omitted').toHaveText('0');

  /*
    §7a's `display` is 72px. Read from the element rather than from its class:
    the claim is about what the reader sees, and a class that generates no rule
    leaves the text at its inherited size while the markup still looks right.
  */
  const size = await count.evaluate((el) => getComputedStyle(el).fontSize);
  expect(size, 'a zero keeps display').toBe('72px');

  /*
    Muted is a COLOUR, so it is compared against the two colours it could be —
    asserting "not the ink colour" would pass for any of a thousand wrongs,
    including transparent.
  */
  const [colour, ink] = await Promise.all([
    count.evaluate((el) => getComputedStyle(el).color),
    page.getByRole('heading', { level: 1 }).evaluate((el) => getComputedStyle(el).color),
  ]);
  expect(colour, 'and takes muted, which is not the ink the heading uses').not.toBe(ink);
});

/**
 * **Four absence sentences collapse to one at page scope, and ONLY at zero.**
 *
 * §7a's scope predicate: a claim renders at the scope of its subject. On an
 * empty collection the subject of "no records have a label yet" is not the
 * label breakdown — it is the collection, and four claims with one subject
 * belong at that subject's scope. Nothing is withheld, so this is not the
 * withheld-set rule; the breakdowns are genuinely empty.
 *
 * §7a also gives the screen with no action exactly one, in the only state where
 * "what should I record next" has an unambiguous answer.
 */
test('an empty collection says it once, at the scope of the collection', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Silent-${suffix}` });
  trackArtist(artist.id as string);

  await page.goto(`/stats?artistId=${artist.id}`);

  await expect(
    page.getByTestId('stats-empty'),
    'one sentence at the collection\'s scope',
  ).toBeVisible();

  /*
    The four per-section sentences are suppressed, not restyled. Asserted on the
    sections themselves rather than on their text: a section rendering with an
    empty body would pass a text assertion and still leave four headings.
  */
  for (const section of ['by-genre', 'by-decade', 'by-label', 'by-store']) {
    await expect(page.getByTestId(section), `${section} is absent at zero`).toHaveCount(0);
  }

  await expect(
    page.getByTestId('stats-empty-action'),
    'and the one action the state has an unambiguous answer for',
  ).toBeVisible();
});

/**
 * **The partial case is untouched, and this is the half that would rot.**
 *
 * The per-section sentences were written for a collection that HAS records and
 * whose breakdown is empty — "records exist and none carry a store" is a
 * different claim from "there are no records", it is actionable, and its subject
 * really is that breakdown. A conditional written as "hide when the breakdown is
 * empty" would pass the test above and silently take this case with it.
 */
test('a stocked collection keeps its per-section absence sentences', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Partial-${suffix}` });
  trackArtist(artist.id as string);
  /* A record with no store, no label, no genre and no year: every breakdown
     empty while the collection is not. */
  await post(page, '/api/records', { title: `Bare ${suffix}`, artistId: artist.id });

  await page.goto(`/stats?artistId=${artist.id}`);

  await expect(page.getByTestId('stats-empty'), 'the page-scope sentence is for zero only').toHaveCount(0);
  await expect(page.getByTestId('by-store'), 'the section stays').toBeVisible();
  await expect(page.getByTestId('by-store')).toContainText('No records record where they were bought.');
});
