import { expect, test, type Page } from '@playwright/test';
import { removeRecordsFor, seedRecords } from './seed';

/**
 * SPEC.md §10 `/`: the collection screen's controls.
 *
 * E2E rather than integration because the behaviour under test is NAVIGATION —
 * every control builds a URL and the server re-renders from it. Calling the
 * component would test the href construction, which `collection-params.test.ts`
 * already covers; only a real browser proves the round trip.
 *
 * §7.1 and §5.2's `matchedVia` are the substance here: filtering by a parent
 * genre must return records tagged with a child, AND say why, or the result
 * reads as a bug.
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

/**
 * A uniquely-named fixture per run.
 *
 * The E2E database is not reset between runs and duplicate records are legal
 * (§4), so a fixture using fixed names would accumulate and make counts
 * unassertable. Every name carries the run id, and every assertion is scoped to
 * it.
 */
function makeSuffix(): string {
  return `e2e${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

type Fixture = {
  suffix: string;
  /** Shared by all three seeded records, so a spec can scope to its own run. */
  artistId: string;
  punkId: string;
  uk82Id: string;
  crustId: string;
  labelId: string;
};

async function seed(page: Page): Promise<Fixture> {
  const suffix = makeSuffix();

  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    return response.json();
  };

  const punk = await post('/api/genres', { name: `Punk-${suffix}` });
  const uk82 = await post('/api/genres', { name: `UK82-${suffix}`, parentGenreId: punk.id });
  const crust = await post('/api/genres', { name: `Crust-${suffix}`, parentGenreId: punk.id });
  const jazz = await post('/api/genres', { name: `Jazz-${suffix}` });

  const artist = await post('/api/artists', { name: `Discharge-${suffix}` });
  const label = await post('/api/labels', { name: `Clay-${suffix}` });

  // Tagged with the GRANDCHILD, so a parent-genre filter only finds it if the
  // §7.1 hierarchy is applied — and matchedVia must name UK82, not Punk.
  await post('/api/records', {
    title: `Hear Nothing ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
    releaseYear: 1982,
    genreIds: [uk82.id],
  });

  // Sibling subtree: in Punk, but a different branch.
  await post('/api/records', {
    title: `Arise ${suffix}`,
    artistId: artist.id,
    releaseYear: 1985,
    genreIds: [crust.id],
  });

  // Outside the Punk subtree entirely, and UNDATED — so it exercises both the
  // genre filter's negative case and the year filter's undated handling.
  await post('/api/records', {
    title: `Kind Of Blue ${suffix}`,
    artistId: artist.id,
    genreIds: [jazz.id],
  });

  return {
    suffix,
    artistId: artist.id,
    punkId: punk.id,
    uk82Id: uk82.id,
    crustId: crust.id,
    labelId: label.id,
  };
}

/**
 * Titles from this run only — the table also holds every earlier run's rows.
 *
 * **Filtering the rendered rows is not sufficient on its own.** This reads what
 * the page SENT; it cannot recover a row pagination left on page 2. Any test
 * asserting on an UNFILTERED collection must also scope the query (`artistId`
 * or `q=<suffix>`), or it silently depends on the whole suite's record count
 * staying under one page. See the comment on 'clicking the active chip'.
 */
async function visibleTitles(page: Page, suffix: string): Promise<string[]> {
  const rows = page.getByRole('row').filter({ hasText: suffix });
  const titles: string[] = [];
  for (const row of await rows.all()) {
    const link = row.getByRole('link').first();
    titles.push(((await link.textContent()) ?? '').trim());
  }
  return titles.sort();
}

/**
 * Waits for the RENDERED rows to match, rather than reading them once.
 *
 * `toHaveURL` is not a sufficient signal: `router.push` updates the URL BEFORE
 * the server render lands, so a read taken then returns the previous rows. This
 * is the same mistake diagnosed in the quarantined /manage specs — asserting on
 * a state the mutation has not reached yet — and `expect.poll` is the fix,
 * because it retries the whole read instead of sampling once.
 */
async function expectTitles(page: Page, suffix: string, expected: string[]): Promise<void> {
  await expect
    .poll(() => visibleTitles(page, suffix), { timeout: 15_000 })
    .toEqual(expected);
}

/**
 * An artist with 55 records — one page of 50 plus a remainder — inserted in ONE
 * database round trip rather than 55 HTTP requests.
 *
 * The fixture, not the assertions, was the load. Creating them through the API
 * — sequentially OR concurrently — raised every other spec's flake rate from
 * ~0.5 to 4-7 failures per run against the shared dev server. Measured both
 * ways; concurrent was worse. A single INSERT ... SELECT costs one query and
 * the rate returns to baseline.
 *
 * Going around the API is acceptable HERE because these two tests are about
 * PAGINATION, not about record creation: what they need is a collection larger
 * than one page, and how the rows got there is incidental. Tests that exercise
 * the write path still use the API.
 *
 * 55 rather than a round number so the last page is PARTIAL: a range label
 * bounded by page*pageSize instead of by the rows returned reads "51–100 of 55"
 * here, and would be correct on any exact multiple.
 */
/** This run's seeded artist, for scoping a spec to only its own records. */
async function artistIdFor(page: Page, suffix: string): Promise<string> {
  const list = await (await page.request.get('/api/artists?pageSize=200')).json();
  const artist = list.data.find((row: { name: string }) => row.name === `Discharge-${suffix}`);
  expect(artist, `seeded artist for ${suffix}`).toBeDefined();
  return artist.id as string;
}

async function bulkArtist(page: Page, name: string, suffix: string): Promise<string> {
  const artist = await (await page.request.post('/api/artists', { data: { name } })).json();

  await seedRecords(artist.id, name, suffix, 55);

  return artist.id as string;
}

/**
 * Waits for the controls to be INTERACTIVE, not merely present.
 *
 * WebKit reaches the DOM before React hydrates, so an interaction landing in
 * that window is applied to the DOM and never reaches React's state. Measured
 * on the record form: 6 of 8 submissions lost a filled field without this wait,
 * 0 of 8 with it. A real user cannot act faster than hydration, so this is a
 * harness concern rather than a product defect.
 *
 * The signal is `data-hydrated`, set from an effect in CollectionFilters. An
 * earlier version waited for the sort select and did not fix it: the select is
 * server-rendered, so its presence proves the markup arrived rather than that
 * its onChange exists.
 */
async function controlsReady(page: Page): Promise<void> {
  await page.locator('[data-hydrated="true"]').first().waitFor({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('searching narrows the collection and survives a reload', async ({ page }) => {
  const f = await seed(page);

  /**
   * Searched on a word unique to ONE record, not on the run suffix.
   *
   * The suffix appears in every seeded title AND in the artist name, and §5.2
   * makes `q` fuzzy across both — so searching for it correctly returns all
   * three, and an assertion expecting one would be testing the fixture rather
   * than the filter. The fixture rule from NOTES, met in my own test.
   */
  /**
   * Scoped by artistId in the URL, then searched by title word.
   *
   * Two collisions have to be avoided at once, and neither the term alone nor
   * the term-plus-suffix does it:
   *
   *   - 'Hear Nothing' matches every PARALLEL PROJECT'S copy, since chromium
   *     and mobile each seed one;
   *   - 'Hear Nothing <suffix>' matches all THREE of this run's records,
   *     because §5.2 makes `q` fuzzy across the artist name too and the artist
   *     is `Discharge-<suffix>`.
   *
   * The artist filter narrows to this run; `q` then does the work the test is
   * actually about. Both tried and measured before landing here.
   */
  const term = 'Hear Nothing';
  const artistId = await artistIdFor(page, f.suffix);
  await page.goto(`/?artistId=${artistId}`);
  await controlsReady(page);

  // Wait for the filtered page to settle before typing: the search box is
  // keyed on the URL's `q`, so it remounts when navigation completes and a
  // value typed into the outgoing instance is discarded.
  await expect(page.getByRole('searchbox', { name: 'Search the collection' })).toBeVisible();
  await expect(page.getByRole('link', { name: `Hear Nothing ${f.suffix}` })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('searchbox', { name: 'Search the collection' }).fill(term);
  await page.getByRole('button', { name: 'Search' }).click();

  /**
   * 15s, not the 5s default. The submit navigates, and under full-suite load
   * the dev server's render is slower than 5s — verified that both the button
   * and Enter submit correctly in isolation, so the shorter timeout was
   * measuring machine load rather than behaviour. Same lesson as the
   * quarantined /manage specs: allow for the work the interaction triggers.
   */
  await expect(page).toHaveURL(/[?&]q=/, { timeout: 15_000 });
  await expectTitles(page, f.suffix, [`Hear Nothing ${f.suffix}`]);

  // The URL is the state, so a reload reproduces the view rather than resetting
  // it — the reason filters do not live in React state.
  await page.reload();
  await expectTitles(page, f.suffix, [`Hear Nothing ${f.suffix}`]);
  await expect(page.getByRole('searchbox', { name: 'Search the collection' })).toHaveValue(term);
});

test('a parent-genre chip finds a record tagged with its grandchild, and says why', async ({
  page,
}) => {
  const f = await seed(page);

  /**
   * Navigated straight to the filtered URL rather than clicking the chip on an
   * unfiltered page 1.
   *
   * Specs run fully parallel against one database, so another spec's bulk
   * fixture can be present while this one runs — 110 rows that push this run's
   * records off page 1 and its chip out of the visible facets. Clicking the
   * chip is covered by 'clicking the active chip clears it'; what THIS spec is
   * about is §7.1 hierarchy plus matchedVia, and the URL reaches that state
   * without depending on what else the database holds.
   */
  await page.goto(`/?genreId=${f.punkId}`);
  await controlsReady(page);

  // §7.1: both the UK82 and Crust records are in the Punk subtree; the Jazz
  // one is not.
  await expectTitles(page, f.suffix, [`Arise ${f.suffix}`, `Hear Nothing ${f.suffix}`]);

  /**
   * §5.2's matchedVia, the whole reason the field exists: this record's only
   * visible genre is UK82, and without this line its appearance under a Punk
   * filter reads as a bug.
   */
  const row = page.getByRole('row').filter({ hasText: `Hear Nothing ${f.suffix}` });
  await expect(row).toContainText(`in Punk-${f.suffix} via UK82-${f.suffix}`);
});

test('clicking the active chip clears it', async ({ page }) => {
  /**
   * Scoped to this spec's OWN artist, exactly as the pagination specs are.
   *
   * Unscoped, this asserted against the WHOLE collection, and every other
   * spec's records land in the same table: at 68 records the 50-per-page cut
   * dropped this run's undated record onto page 2 and the assertion read that
   * as "clearing the chip did not restore it".
   *
   * It only ever failed in a full suite — alone, the collection fits one page
   * — which is what made it look like flake for three steps. `q=<suffix>`
   * would isolate it too, but it writes to the URL, and the URL round-trip is
   * the thing under test here.
   */
  const f = await seed(page);
  await page.goto(`/?artistId=${f.artistId}`);
  await controlsReady(page);

  const chip = page.getByRole('button', { name: `Punk-${f.suffix}` });
  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'true');

  await chip.click();
  await expect(chip).toHaveAttribute('aria-pressed', 'false');
  await expect
    .poll(() => visibleTitles(page, f.suffix), { timeout: 15_000 })
    .toContain(`Kind Of Blue ${f.suffix}`);
});

test('a year range keeps undated records until they are excluded, and says how many', async ({
  page,
}) => {
  const f = await seed(page);

  // A year range that excludes the 1985 record but not the 1982 one. The
  // undated record's fate is what the toggle decides.
  await page.goto('/?yearFrom=1980&yearTo=1983');

  await expect(page.getByText(/records? (has|have) no release year/)).toBeVisible();

  // Included by default (§5.2), so the undated record is present alongside the
  // in-range one.
  await expectTitles(page, f.suffix, [`Hear Nothing ${f.suffix}`, `Kind Of Blue ${f.suffix}`]);

  /**
   * click(), not uncheck().
   *
   * `uncheck()` verifies the checkbox's state synchronously after clicking, and
   * this control navigates: the input is re-rendered from server props, which
   * arrive after the round trip. Verified that the interaction itself is
   * correct — the URL gains includeUndated=false and the box ends unchecked —
   * so the strict helper was reporting a timing property, not a defect. The
   * outcome is asserted below instead.
   */
  await page.getByLabel('Include records with no release year').click();
  await expect(page).toHaveURL(/includeUndated=false/);

  await expectTitles(page, f.suffix, [`Hear Nothing ${f.suffix}`]);
  // The count is still stated when they are hidden — that is what stops the
  // omission being invisible.
  await expect(page.getByText(/records? (has|have) no release year/)).toBeVisible();
});

test('sorting reorders the rows', async ({ page }) => {
  const f = await seed(page);
  // q on the suffix deliberately: this test wants all three of this run's
  // records in scope, and the fuzzy match across title and artist gives that.
  await page.goto(`/?q=${f.suffix}`);
  await controlsReady(page);

  await page.getByLabel('Sort by').selectOption('releaseYear:desc');

  // NULLS LAST in both directions, so the undated record is last either way.
  const rows = page.getByRole('row').filter({ hasText: f.suffix });
  // Sorted by year descending: 1985 first. Poll, because the reorder arrives
  // with the server render rather than with the URL change.
  await expect(rows.first()).toContainText(`Arise ${f.suffix}`, { timeout: 15_000 });
  await expect(rows).toHaveCount(3);
});

test('filters compose rather than replacing each other', async ({ page }) => {
  // The defect a single-filter test cannot catch: applying a second filter
  // silently dropping the first.
  const f = await seed(page);
  await page.goto('/');
  await controlsReady(page);

  await page.getByRole('button', { name: `Punk-${f.suffix}` }).click();
  await page.getByRole('button', { name: `Clay-${f.suffix}` }).click();

  await expect(page).toHaveURL(/genreId=/);
  await expect(page).toHaveURL(/labelId=/);

  // Only the record carrying BOTH.
  await expectTitles(page, f.suffix, [`Hear Nothing ${f.suffix}`]);
});

/**
 * THE HONESTY TEST for the pending-query ref.
 *
 * The ref exists so a click can build on intent the server has not caught up
 * with. That is legitimate only while the URL remains the source of truth: the
 * moment the ref starts OWNING filter state, arriving somewhere by clicking
 * and arriving by loading the URL can diverge, and the client copy wins.
 *
 * So: click through to a multi-filter view, then load that exact URL cold in a
 * fresh context. Same URL and same rows, or the pending state has become state
 * ownership and needs cutting back.
 */
test('clicking through to a filtered view equals loading that URL directly', async ({
  page,
  browser,
}) => {
  const f = await seed(page);
  await page.goto('/');
  await controlsReady(page);

  await page.getByRole('button', { name: `Punk-${f.suffix}` }).click();
  await page.getByRole('button', { name: `Clay-${f.suffix}` }).click();
  await page.getByLabel('Sort by').selectOption('releaseYear:desc');

  await expect(page).toHaveURL(/genreId=/);
  const clickedUrl = page.url();
  const clickedTitles = await visibleTitles(page, f.suffix);

  // A FRESH context — new storage, nothing carried over from the clicking
  // session, so only the URL can be conveying the state.
  const context = await browser.newContext();
  const cold = await context.newPage();
  try {
    await login(cold);
    await cold.goto(clickedUrl);

    await expectTitles(cold, f.suffix, clickedTitles);
    expect(new URL(cold.url()).search).toBe(new URL(clickedUrl).search);

    // The controls must reflect the URL too, or the rows and the chips disagree.
    await expect(cold.getByRole('button', { name: `Punk-${f.suffix}` })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(cold.getByLabel('Sort by')).toHaveValue('releaseYear:desc');
  } finally {
    await context.close();
  }
});

/**
 * SPEC.md §10's grid/table toggle and the page controls.
 *
 * The defects these exist to catch are both about state SURVIVING a
 * navigation: a page link that drops the active filter, and a filter change
 * that leaves you on page 4 of a result set with one page.
 */
/**
 * Desktop only: the toggle is hidden below `sm`, because a single-column grid
 * at 390px is a taller table rather than a distinct view (§10 wants mobile
 * usable one-handed). The mobile case is covered by the test below, which
 * asserts the control is absent AND that a grid URL still renders.
 */
test('the view toggle switches layout and survives a reload', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === 'mobile', 'the toggle is desktop-only by design');

  /**
   * Scoped to this run's records with `q`, not left on an unfiltered page 1.
   *
   * Now that the collection paginates, the two bulk-fixture specs insert 110
   * records whose titles sort AHEAD of this one alphabetically, pushing it to
   * page 3 — so the test failed deterministically whenever it ran alongside
   * them, and passed alone. The fixture rule from NOTES, in its cross-spec
   * form: a test that assumes its rows are on the first page is assuming
   * something no other spec is obliged to preserve.
   */
  const f = await seed(page);

  /**
   * Filtered to this spec's OWN artist, not to `q=<suffix>`.
   *
   * Scoping by the suffix is not enough: the bulk-fixture specs put the same
   * suffix in their 110 titles, and `q` is fuzzy across title AND artist
   * (§5.2), so it matches those too and this record is still pushed off page 1.
   * `artistId` is the only scope no other spec shares.
   *
   * The underlying rule is NOTES' fixture rule in its cross-spec form: a test
   * that assumes its rows are on the first page assumes something no other
   * spec is obliged to preserve. Deterministic once pagination existed —
   * passed alone, failed alongside the paging specs.
   */
  const artistId = await artistIdFor(page, f.suffix);
  await page.goto(`/?artistId=${artistId}`);
  await controlsReady(page);

  await page.getByRole('button', { name: 'grid', exact: true }).click();
  await expect(page).toHaveURL(/view=grid/, { timeout: 15_000 });

  // The table's column headers are gone in grid mode; the records are not.
  await expect(page.getByRole('columnheader', { name: 'Record' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: `Hear Nothing ${f.suffix}` })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'grid', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(page.getByRole('columnheader', { name: 'Record' })).toHaveCount(0);
});

test('paging keeps the active filter rather than dropping it', async ({ page }) => {
  /**
   * The defect: a page link built from the page number alone, discarding the
   * filters — so page 2 of a filtered view silently shows the whole
   * collection. Seeded past one page so the control actually renders.
   */
  const f = await seed(page);

  const artist = await bulkArtist(page, `Bulk-${f.suffix}`, f.suffix);

  try {
    await page.goto(`/?artistId=${artist}`);

    const pagination = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pagination).toContainText('1–50 of 55');

    await pagination.getByRole('link', { name: 'Page 2' }).click();

    // Still filtered: 5 rows, not the whole collection.
    await expect(pagination).toContainText('51–55 of 55', { timeout: 15_000 });
    await expect(page).toHaveURL(/artistId=/);
  } finally {
    // In a finally, so a failing assertion still cleans up. A spec that leaves
    // 55 rows behind on failure makes every LATER spec fail too, and the
    // original cause is then buried under the cascade.
    await removeRecordsFor(artist);
  }
});

test('changing a filter returns to page 1', async ({ page }) => {
  // Staying on page 2 while narrowing the results is how a filter appears to
  // return nothing — the rows exist, just not that far in.
  const f = await seed(page);

  const artist = await bulkArtist(page, `Bulk2-${f.suffix}`, f.suffix);

  try {
    await page.goto(`/?artistId=${artist}&page=2`);
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('51–55 of 55');

    await page.getByLabel('Sort by').selectOption('title:desc');

    await expect(page).not.toHaveURL(/page=/, { timeout: 15_000 });
    await expect(page.getByRole('navigation', { name: 'Pagination' })).toContainText('1–50 of 55');
  } finally {
    await removeRecordsFor(artist);
  }
});

test('the grid toggle is hidden on a phone, but a grid URL still renders', async ({
  page,
}, testInfo) => {
  /**
   * The control is hidden, not the capability. A grid link shared from a
   * desktop must still open — hiding the toggle must not make a URL
   * unreachable, which is the failure mode of "just remove it on mobile".
   */
  test.skip(testInfo.project.name !== 'mobile', 'about the mobile viewport specifically');

  const f = await seed(page);
  const artistId = await artistIdFor(page, f.suffix);

  await page.goto(`/?artistId=${artistId}`);
  await controlsReady(page);
  await expect(page.getByRole('group', { name: 'View' })).toBeHidden();

  await page.goto(`/?artistId=${artistId}&view=grid`);
  await controlsReady(page);
  await expect(page.getByRole('link', { name: `Hear Nothing ${f.suffix}` })).toBeVisible();
  await expect(page.getByRole('columnheader', { name: 'Record' })).toHaveCount(0);
});


