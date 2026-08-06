import { expect, test, type Page } from '@playwright/test';

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

  return { suffix, punkId: punk.id, uk82Id: uk82.id, crustId: crust.id, labelId: label.id };
}

/** Titles from this run only — the table also holds every earlier run's rows. */
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

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('searching narrows the collection and survives a reload', async ({ page }) => {
  const f = await seed(page);
  await page.goto('/');

  /**
   * Searched on a word unique to ONE record, not on the run suffix.
   *
   * The suffix appears in every seeded title AND in the artist name, and §5.2
   * makes `q` fuzzy across both — so searching for it correctly returns all
   * three, and an assertion expecting one would be testing the fixture rather
   * than the filter. The fixture rule from NOTES, met in my own test.
   */
  await page.getByRole('searchbox', { name: 'Search the collection' }).fill('Hear Nothing');
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
  await expect(page.getByRole('searchbox', { name: 'Search the collection' })).toHaveValue(
    'Hear Nothing',
  );
});

test('a parent-genre chip finds a record tagged with its grandchild, and says why', async ({
  page,
}) => {
  const f = await seed(page);
  await page.goto('/');

  await page.getByRole('button', { name: `Punk-${f.suffix}` }).click();

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
  const f = await seed(page);
  await page.goto('/');

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
