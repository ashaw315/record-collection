import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedDiscogsCache } from './seed';

/* Records and artists removed after each test — see e2e/cleanup.ts. */
registerCleanup();

/**
 * SPEC.md §11's flows 3, 4 and 11 — the three this step is accountable for.
 *
 * **Where each thing is mocked, and why it differs:**
 *
 *   - `/api/discogs/search` and `/api/discogs/master/:id/versions` are called by
 *     the CLIENT, so `page.route` is genuinely in the request path;
 *   - `/records/new`'s prefill runs in a SERVER COMPONENT, where `page.route`
 *     is not — that is how a live call escaped earlier in this step — so the
 *     release is seeded into `discogs_cache` from the committed fixture.
 *
 * The distinction is the whole lesson of the no-live-calls guard: a mock has to
 * sit in the actual path, and "it's a Playwright stub" says nothing about
 * whether it does.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

const VERSIONS_FIXTURE = JSON.parse(
  readFileSync('test/fixtures/discogs/master-versions-discharge.json', 'utf8'),
) as { versions: Array<Record<string, unknown>> };

/** The UK 1982 Clay first pressing, and the 1989 reissue sharing its catalog number. */
const ORIGINAL = 381756;
const REISSUE = 6779382;
const MASTER = 50683;
const TITLE = 'Hear Nothing See Nothing Say Nothing';

let releaseId: number;

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

async function formReady(page: Page): Promise<void> {
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });

  /*
    **Open the "Everything else" disclosure if it is closed.**

    §5.7 makes the manual form the fallback path, so on CREATE everything past
    title, artist, catalog number and matrix is collapsed — the in-shop case is
    three fields and a button, and twenty fields between the reader and submit
    is what made this screen 2,439px on a phone. On EDIT it is open already,
    because a collapsed section there hides values that ARE recorded.

    A test filling any of those fields has to open it, exactly as a person does.
    Done here rather than in each test: the disclosure is a property of the
    form, not of what any one spec is checking.
  */
  const disclosure = page.locator('details').filter({ has: page.locator('summary', { hasText: 'Everything else' }) });
  if (
    (await disclosure.count()) > 0 &&
    !(await disclosure.first().evaluate((el) => (el as HTMLDetailsElement).open))
  ) {
    await disclosure.first().locator('summary').click();
    await expect(disclosure.first()).toHaveAttribute('open', '');
  }
}

function makeSuffix(): string {
  return `l${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

/**
 * Answers the two CLIENT-side Discogs endpoints from fixtures.
 *
 * `ownership` is supplied per result, because these specs are about what the
 * screen does with a tier — the query that computes it has its own 21 tests
 * against the database.
 */
async function stubLookup(
  page: Page,
  options: {
    results: Array<Record<string, unknown>>;
    versions?: Array<Record<string, unknown>>;
  },
) {
  await page.route('**/api/discogs/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: options.results,
        meta: { total: options.results.length, page: 1, pageSize: 25 },
      }),
    });
  });

  await page.route('**/api/discogs/master/*/versions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: options.versions ?? [],
        meta: {
          total: (options.versions ?? []).length,
          page: 1,
          pageSize: 25,
          pages: 1,
          ownershipChecked: true,
        },
      }),
    });
  });
}

const NO_OWNERSHIP = {
  tier: null,
  ownedPressing: null,
  wantedPriority: null,
  isTargetPressing: false,
};

function searchResult(overrides: Record<string, unknown> = {}) {
  return {
    discogsId: ORIGINAL,
    type: 'master',
    masterId: MASTER,
    title: TITLE,
    artist: 'Discharge',
    thumbUrl: 'https://i.discogs.com/thumb.jpg',
    coverUrl: 'https://i.discogs.com/cover.jpg',
    year: 1982,
    country: 'UK',
    label: 'Clay Records',
    catalogNumber: 'CLAY LP 3',
    formats: ['Vinyl', 'LP', 'Album'],
    genres: ['Rock'],
    styles: ['Hardcore', 'Punk'],
    isReissue: false,
    communityHave: 3739,
    communityWant: 2165,
    ownership: NO_OWNERSHIP,
    ...overrides,
  };
}

/** A version row as the versions endpoint emits it, ownership included. */
function versionRow(discogsId: number, ownership: Record<string, unknown> = NO_OWNERSHIP) {
  const raw = VERSIONS_FIXTURE.versions.find((v) => v.id === discogsId);

  return {
    discogsId,
    title: TITLE,
    label: (raw?.label as string) ?? 'Clay Records',
    country: (raw?.country as string) ?? 'UK',
    year: Number((raw?.released as string) ?? 1982),
    catalogNumber: (raw?.catno as string) ?? 'CLAY LP 3',
    formats: String(raw?.format ?? 'LP, Album').split(', '),
    isReissue: discogsId === REISSUE,
    thumbUrl: 'https://i.discogs.com/thumb.jpg',
    communityHave: 100,
    communityWant: 100,
    ownership,
  };
}

/**
 * Seeded once per WORKER, not per test.
 *
 * Per-test seeding opened a database connection for every test across every
 * parallel worker, and the full suite started failing with ECONNRESET — four
 * to six failures a run, where the baseline was one. Measured before and
 * after rather than assumed.
 *
 * `beforeAll` is safe here because the seed is an UPSERT and nothing deletes
 * it: the earlier problem was an `afterAll` cleanup removing a row a sibling
 * worker still needed, which is a different mistake.
 */
test.beforeAll(async () => {
  releaseId = await seedDiscogsCache('release-detailed');
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

/**
 * §11 flow 3: "Use the structured lookup form (artist + catalog number), drill
 * from a master into a specific version, verify cover art and pressing details
 * render, import it, verify prefilled fields, save it."
 */
test('flow 3: search, drill into a version, import it and save', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await page.request.post('/api/artists', {
    data: { name: `Discharge ${suffix}` },
  });
  trackArtist(((await artist.json()) as { id: string }).id);
  const artistId = (await artist.json()).id;

  await stubLookup(page, {
    results: [searchResult()],
    versions: [versionRow(ORIGINAL), versionRow(REISSUE)],
  });

  await page.goto('/lookup');
  await formReady(page);

  // The STRUCTURED form — artist and catalog number, which is what §5.7 calls
  // the effective way to pin down a pressing.
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByLabel('Catalog no.').fill('CLAY LP 3');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  const card = page.getByTestId('result-card').first();
  await expect(card).toBeVisible({ timeout: 15_000 });

  // Cover art and pressing details render on the card.
  await expect(card.locator('img')).toBeVisible();
  await expect(card).toContainText('CLAY LP 3');
  await expect(card).toContainText('1982');
  await expect(card).toContainText('UK');

  // Drill from the master into its versions.
  await card.getByTestId('expand-versions').click();

  const rows = page.getByTestId('version-row');
  await expect(rows).toHaveCount(2, { timeout: 15_000 });

  /**
   * The comparison the table exists for: same catalog number, different years.
   *
   * Scoped to `version-row`, because `data-discogs-id` is also on the result
   * card that contains the table — an unscoped selector matched both and
   * Playwright refused it in strict mode. The refusal was right: the two are
   * different things that happen to share an id.
   */
  const originalRow = rows.filter({ has: page.locator('[data-column="year"]') }).nth(0);
  await expect(originalRow.locator('[data-column="year"]')).toHaveText('1982');
  await expect(originalRow.locator('[data-column="catalogNumber"]')).toHaveText('CLAY LP 3');

  const reissueRow = rows.nth(1);
  await expect(reissueRow.locator('[data-column="year"]')).toHaveText('1989');
  await expect(
    reissueRow.locator('[data-column="catalogNumber"]'),
    'the same catalog number — only the year and format separate them',
  ).toHaveText('CLAY LP 3');

  // Import the specific version — §5.7's two-stage flow opens the form first.
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await expect(page.getByLabel('Title')).toHaveValue(TITLE);
  await expect(page.getByLabel('Catalog no.')).toHaveValue('CLAY LP 3');

  /**
   * The matrix arrives EMPTY, with Discogs' variants shown beside it.
   *
   * This previously asserted the field was prefilled. §5.7 requires the user to
   * hand-enter the runout from the dead wax, and this release lists eight
   * variants across four pressings — prefilling them writes a fingerprint
   * matching no physical record. The reference stays visible so the user can
   * compare while reading the wax.
   */
  await expect(page.getByLabel('Matrix / runout')).toHaveValue('');
  await expect(page.getByTestId('matrix-reference')).toContainText('CLAY-LP-3-A2');

  await page.getByLabel('Artist', { exact: true }).selectOption(artistId);
  await page.getByRole('button', { name: /Add record/ }).click();

  /**
   * NOT anchored with `$`: a save whose Discogs cover could not be fetched
   * lands on `?cover=failed`, which is the notice telling the user so. The
   * record id is what this assertion is about.
   */
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}(\?|$)/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: TITLE })).toBeVisible();
});

/**
 * §11 flow 4: the three ownership tiers.
 *
 * **The fixture makes a collapsed implementation VISIBLY wrong rather than
 * coincidentally right**: every scenario uses the same artist and the same
 * title, so nothing but the pressing distinguishes them. An implementation
 * that answered "you own this pressing" to all three would pass a fixture
 * where the albums differed.
 */
test.describe('flow 4: ownership badge tiers', () => {
  test('tier 1: a record owned in the EXACT pressing', async ({ page }) => {
    const suffix = makeSuffix();
    const artist = await page.request.post('/api/artists', {
      data: { name: `Discharge ${suffix}` },
    });
  trackArtist(((await artist.json()) as { id: string }).id);
    const artistId = (await artist.json()).id;
    const pressing = await page.request.post('/api/pressings', {
      data: { catalogNumber: `CLAY-${suffix}`, countryPressed: 'UK', yearPressed: 1982 },
    });
    await page.request.post('/api/records', {
      data: { title: `${TITLE} ${suffix}`, artistId, pressingId: (await pressing.json()).id },
    });

    await stubLookup(page, {
      results: [
        searchResult({
          title: `${TITLE} ${suffix}`,
          ownership: {
            tier: 'owned_exact',
            ownedPressing: { year: 1982, country: 'UK', catalogNumber: `CLAY-${suffix}` },
            wantedPriority: null,
            isTargetPressing: false,
          },
        }),
      ],
    });

    await page.goto('/lookup');
    await formReady(page);
    await page.getByLabel('Artist').fill('Discharge');
    await page.getByRole('button', { name: 'Search Discogs' }).click();

    const badge = page.getByTestId('ownership-badge').first();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveAttribute('data-tier', 'owned_exact');
    await expect(badge).toContainText('You own this pressing');
  });

  test('tier 2: a DIFFERENT pressing of an owned album, never the exact badge', async ({
    page,
  }) => {
    /**
     * §7.7: "This case must never be collapsed into the exact match — it is the
     * whole reason the distinction exists, and getting it wrong is what causes
     * a bad buying decision in a store."
     */
    await stubLookup(page, {
      results: [
        searchResult({
          ownership: {
            tier: 'owned_different_pressing',
            ownedPressing: { year: 1989, country: 'UK', catalogNumber: 'CLAY LP 3' },
            wantedPriority: null,
            isTargetPressing: false,
          },
        }),
      ],
    });

    await page.goto('/lookup');
    await formReady(page);
    await page.getByLabel('Artist').fill('Discharge');
    await page.getByRole('button', { name: 'Search Discogs' }).click();

    const badge = page.getByTestId('ownership-badge').first();
    await expect(badge).toBeVisible({ timeout: 15_000 });

    await expect(badge).toHaveAttribute('data-tier', 'owned_different_pressing');
    await expect(badge, 'NOT the exact-match badge').not.toContainText('You own this pressing');
    await expect(badge).toContainText('DIFFERENT');

    // §7.7 requires the year, country and catalog of the copy already owned —
    // the whole question being whether the one in hand is better.
    await expect(page.getByTestId('ownership-detail').first()).toContainText('1989');
  });

  test('tier 2: a record logged with NO pressing at all', async ({ page }) => {
    /**
     * THE likeliest real instance, and its own scenario for that reason: §10's
     * quick in-store entry exists to create records without pressings, so the
     * app's own feature is what creates this blind spot.
     *
     * "You own a different pressing" is honest — the album is owned and the
     * copy cannot be identified. "You own this pressing" would be a claim
     * nothing supports, and no badge at all would send the user home with a
     * second copy.
     */
    await stubLookup(page, {
      results: [
        searchResult({
          ownership: {
            tier: 'owned_different_pressing',
            ownedPressing: null,
            wantedPriority: null,
            isTargetPressing: false,
          },
        }),
      ],
    });

    await page.goto('/lookup');
    await formReady(page);
    await page.getByLabel('Artist').fill('Discharge');
    await page.getByRole('button', { name: 'Search Discogs' }).click();

    const badge = page.getByTestId('ownership-badge').first();
    await expect(badge).toBeVisible({ timeout: 15_000 });

    await expect(badge).toHaveAttribute('data-tier', 'owned_different_pressing');
    await expect(
      page.getByTestId('ownership-detail').first(),
      'says the pressing is unknown rather than rendering a blank',
    ).toContainText('not recorded');
  });

  test('tier 3: an item on the want list', async ({ page }) => {
    await stubLookup(page, {
      results: [
        searchResult({
          ownership: {
            tier: 'wanted',
            ownedPressing: null,
            wantedPriority: 1,
            isTargetPressing: false,
          },
        }),
      ],
    });

    await page.goto('/lookup');
    await formReady(page);
    await page.getByLabel('Artist').fill('Discharge');
    await page.getByRole('button', { name: 'Search Discogs' }).click();

    const badge = page.getByTestId('ownership-badge').first();
    await expect(badge).toBeVisible({ timeout: 15_000 });
    await expect(badge).toHaveAttribute('data-tier', 'wanted');
    await expect(badge).toContainText('want list');
  });

  test('no match: NO badge, rather than one reading "not owned"', async ({ page }) => {
    // §7.7: "No match: no badge." A screen of "not owned" badges is noise that
    // makes the three real ones harder to see.
    await stubLookup(page, { results: [searchResult()] });

    await page.goto('/lookup');
    await formReady(page);
    await page.getByLabel('Artist').fill('Discharge');
    await page.getByRole('button', { name: 'Search Discogs' }).click();

    await expect(page.getByTestId('result-card').first()).toBeVisible({ timeout: 15_000 });
    await expect(page.getByTestId('ownership-badge')).toHaveCount(0);
  });

  test('the three tiers are visually distinct, not just differently worded', async ({ page }) => {
    /**
     * The property that matters on a phone in a shop: someone reads shape and
     * colour before a sentence. Asserted by rendering all three at once and
     * checking their tiers differ — a single tone across all of them would
     * satisfy every text assertion above.
     */
    await stubLookup(page, {
      results: [
        searchResult({
          discogsId: 1,
          ownership: { ...NO_OWNERSHIP, tier: 'owned_exact' },
        }),
        searchResult({
          discogsId: 2,
          ownership: {
            tier: 'owned_different_pressing',
            ownedPressing: { year: 1989, country: 'UK', catalogNumber: 'CLAY LP 3' },
            wantedPriority: null,
            isTargetPressing: false,
          },
        }),
        searchResult({
          discogsId: 3,
          ownership: { ...NO_OWNERSHIP, tier: 'wanted', wantedPriority: 2 },
        }),
      ],
    });

    await page.goto('/lookup');
    await formReady(page);
    await page.getByLabel('Artist').fill('Discharge');
    await page.getByRole('button', { name: 'Search Discogs' }).click();

    const badges = page.getByTestId('ownership-badge');
    await expect(badges).toHaveCount(3, { timeout: 15_000 });

    const classes = await badges.evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLElement).className),
    );

    expect(new Set(classes).size, 'three tiers, three visual treatments').toBe(3);
  });
});

/**
 * §11 flow 11: "Add the same album twice in two different pressings and verify
 * both persist as separate records."
 *
 * §4: duplicate records are legal and expected — a collector may own the same
 * album in a UK original and a US reissue, and they are different objects worth
 * different amounts. CLAUDE.md §8 calls collapsing them the worst bug this app
 * can ship.
 */
test('flow 11: the same album in two pressings persists as two records', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await page.request.post('/api/artists', {
    data: { name: `Discharge ${suffix}` },
  });
  trackArtist(((await artist.json()) as { id: string }).id);
  const artistId = (await artist.json()).id;
  const title = `${TITLE} ${suffix}`;

  const first = await page.request.post('/api/pressings', {
    data: { catalogNumber: `CLAY-${suffix}-A`, countryPressed: 'UK', yearPressed: 1982 },
  });
  const second = await page.request.post('/api/pressings', {
    data: { catalogNumber: `CLAY-${suffix}-B`, countryPressed: 'US', yearPressed: 1989 },
  });

  const one = await page.request.post('/api/records', {
    data: { title, artistId, pressingId: (await first.json()).id },
  });
  const two = await page.request.post('/api/records', {
    data: { title, artistId, pressingId: (await second.json()).id },
  });

  expect(one.status()).toBe(201);
  expect(two.status(), 'a duplicate title is not refused').toBe(201);

  const recordOne = await one.json();
  const recordTwo = await two.json();

  expect(recordOne.id, 'two distinct records').not.toBe(recordTwo.id);
  expect(recordOne.pressingId, 'each with its own pressing').not.toBe(recordTwo.pressingId);

  // BOTH are visible in the collection, not deduplicated into one row.
  await page.goto(`/?artistId=${artistId}`);
  await expect(page.getByRole('link', { name: title })).toHaveCount(2, { timeout: 15_000 });

  // And each detail page shows its own pressing.
  await page.goto(`/records/${recordOne.id}`);
  await expect(page.getByText(`CLAY-${suffix}-A`)).toBeVisible();

  await page.goto(`/records/${recordTwo.id}`);
  await expect(page.getByText(`CLAY-${suffix}-B`)).toBeVisible();
});

test('the form offers every §5.7 search parameter', async ({ page }) => {
  /**
   * FOUND IN REAL USE: the form shipped with 7 of the 12 parameters §5.7
   * specifies, missing format, genre, style, track and the freeform query.
   *
   * `format` is the one that matters most in practice — a Carpenters search
   * returned 32 results where "Vinyl" would have cut it substantially, because
   * a popular album exists on CD, cassette and vinyl and only one of those is
   * in the user's hand.
   *
   * The endpoint accepted all twelve from the start; only the form was short,
   * which is a whole class of defect no endpoint test can see.
   */
  await page.goto('/lookup');
  await formReady(page);

  for (const field of [
    'catno',
    'barcode',
    'artist',
    'title',
    'label',
    'country',
    'year',
    'format',
    'genre',
    'style',
    'track',
    'q',
  ]) {
    await expect(page.locator(`#${field}`), `§5.7 lists ${field}`).toBeVisible();
  }
});

test('sends format to the endpoint, which is what narrows a common album', async ({ page }) => {
  let requestedUrl = '';

  await page.route('**/api/discogs/search**', async (route) => {
    requestedUrl = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: [], meta: { total: 0, page: 1, pageSize: 25 } }),
    });
  });

  await page.goto('/lookup');
  await formReady(page);

  await page.getByLabel('Artist').fill('Carpenters');
  await page.getByLabel('Format').fill('Vinyl');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  await expect.poll(() => requestedUrl).toContain('format=Vinyl');
  expect(requestedUrl).toContain('artist=Carpenters');
});

test('says plainly when ownership could not be checked', async ({ page }) => {
  /**
   * THE highest-stakes absence-as-success case: a version table with no badges
   * is indistinguishable from one where you own nothing, and someone in a shop
   * reads that as "buy it". The failure mode is buying a record you already own
   * because the app quietly could not tell you.
   *
   * Asserted at the SCREEN, not only at the endpoint — the flag exists to be
   * rendered, and a flag nothing renders is the same silence.
   */
  await page.route('**/api/discogs/search**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [searchResult()],
        meta: { total: 1, page: 1, pageSize: 25, dropped: 0 },
      }),
    });
  });

  await page.route('**/api/discogs/master/*/versions**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: [versionRow(ORIGINAL), versionRow(REISSUE)],
        // The master lookup failed, so no row can carry a badge.
        meta: { total: 2, page: 1, pageSize: 25, pages: 1, ownershipChecked: false },
      }),
    });
  });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  await page.getByTestId('result-card').first().getByTestId('expand-versions').click();

  const warning = page.getByTestId('ownership-unchecked');
  await expect(warning).toBeVisible({ timeout: 15_000 });
  await expect(warning, 'names what is missing, not merely that something failed').toContainText(
    /already own/i,
  );

  // The comparison still renders — degraded, not withheld.
  await expect(page.getByTestId('version-row')).toHaveCount(2);
});

test('shows no such warning on the ordinary path', async ({ page }) => {
  // A warning that always appeared would be ignored within a day.
  await stubLookup(page, {
    results: [searchResult()],
    versions: [versionRow(ORIGINAL), versionRow(REISSUE)],
  });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  await page.getByTestId('result-card').first().getByTestId('expand-versions').click();
  await expect(page.getByTestId('version-row')).toHaveCount(2, { timeout: 15_000 });

  await expect(page.getByTestId('ownership-unchecked')).toHaveCount(0);
});

test('versions that look identical collapse into one honest row', async ({ page }) => {
  /**
   * §5.7 calls the version table "the step where the user identifies THEIR
   * pressing", and for some masters the columns cannot.
   *
   * Hot Tuna's master 133514 has THREE US 1970 versions byte-identical on every
   * field the versions endpoint returns — `LSP-4353 | US | 1970 | LP, Album,
   * Stereo | RCA Victor`. Measured against the live API; `format.text`, which
   * carries "Rockaway Pressing", is on the RELEASE endpoint and not on versions.
   *
   * **This is the QA finding that motivated it.** A user picked one of these
   * rows, believed they had 1458122, and reported its pressing plant as wrong.
   * It was right — for release 10040976, which they actually had. Three
   * identical rows look like an answer.
   */
  const twins = [1458122, 6825185, 6440008];
  const versions = [
    ...twins.map((id, index) => ({
      discogsId: id,
      title: 'Hot Tuna',
      label: 'RCA Victor',
      country: 'US',
      year: 1970,
      catalogNumber: 'LSP-4353',
      formats: ['LP', 'Album', 'Stereo'],
      isReissue: false,
      thumbUrl: null,
      // Real counts, most-owned first once grouped.
      communityHave: [3936, 872, 462][index],
      communityWant: 100,
      ownership: NO_OWNERSHIP,
    })),
    {
      discogsId: 4555386,
      title: 'Hot Tuna',
      label: 'RCA Victor',
      country: 'Spain',
      year: 1970,
      catalogNumber: 'LSP-4353',
      formats: ['LP', 'Album'],
      isReissue: false,
      thumbUrl: null,
      communityHave: 30,
      communityWant: 10,
      ownership: NO_OWNERSHIP,
    },
  ];

  await stubLookup(page, { results: [searchResult()], versions });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Hot Tuna');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  const card = page.getByTestId('result-card').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByTestId('expand-versions').click();

  // Two rows, not four: the three twins collapse, Spain stays distinct.
  await expect(page.getByTestId('version-row')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId('identical-toggle')).toContainText('2 more look identical');

  // Expanding shows all three, most-owned first.
  await page.getByTestId('identical-toggle').click();
  await expect(page.getByTestId('version-row')).toHaveCount(4);
  const ids = await page
    .getByTestId('version-row')
    .evaluateAll((rows) => rows.map((row) => row.getAttribute('data-discogs-id')));
  expect(ids.slice(0, 3), 'most-owned first within the group').toEqual([
    '1458122',
    '6825185',
    '6440008',
  ]);
});

test('an owned version is never hidden inside a collapsed group', async ({ page }) => {
  /**
   * §7.7's badge outranks the tidier table. Hiding "you already have this"
   * inside a collapsed group turns it into silence — the absence-as-success
   * failure in the place it costs most: someone in a shop reads no badge as
   * "buy it".
   */
  const versions = [
    {
      discogsId: 1458122,
      title: 'Hot Tuna',
      label: 'RCA Victor',
      country: 'US',
      year: 1970,
      catalogNumber: 'LSP-4353',
      formats: ['LP', 'Album', 'Stereo'],
      isReissue: false,
      thumbUrl: null,
      communityHave: 3936,
      communityWant: 100,
      ownership: NO_OWNERSHIP,
    },
    {
      discogsId: 6825185,
      title: 'Hot Tuna',
      label: 'RCA Victor',
      country: 'US',
      year: 1970,
      catalogNumber: 'LSP-4353',
      formats: ['LP', 'Album', 'Stereo'],
      isReissue: false,
      thumbUrl: null,
      communityHave: 872,
      communityWant: 100,
      // `owned_exact`, the real tier value — a first version used 'exact' and
      // the row collapsed, which is the failure this test exists to catch.
      ownership: {
        tier: 'owned_exact',
        ownedPressing: { year: 1970, country: 'US', catalogNumber: 'LSP-4353' },
        wantedPriority: null,
        isTargetPressing: false,
      },
    },
  ];

  await stubLookup(page, { results: [searchResult()], versions });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Hot Tuna');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  const card = page.getByTestId('result-card').first();
  await expect(card).toBeVisible({ timeout: 15_000 });
  await card.getByTestId('expand-versions').click();

  // Both rows visible although they are indistinguishable, because one is owned.
  await expect(page.getByTestId('version-row')).toHaveCount(2, { timeout: 15_000 });
  await expect(page.getByTestId('identical-toggle')).toHaveCount(0);
  await expect(page.locator('[data-owned="true"]')).toHaveCount(1);
});


test('market data is fetched on demand, not for a page of results', async ({ page }) => {
  /**
   * §10a: layers 1-2 are two calls per release and a search returns fifty
   * results — rendering them eagerly would spend up to a hundred calls of a
   * sixty-per-minute budget on a search the user may not act on.
   */
  let marketCalls = 0;
  await page.route('**/api/discogs/market/**', async (route) => {
    marketCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        numForSale: 11,
        lowestPrice: { value: 47.28, currency: 'USD' },
        conditions: [
          { grade: 'Near Mint (NM or M-)', value: 130.45 },
          { grade: 'Very Good Plus (VG+)', value: 99.76 },
          { grade: 'Very Good (VG)', value: 69.06 },
        ],
        range: { low: 69.06, high: 130.45 },
        currency: 'USD',
        rangeUnavailable: false,
      }),
    });
  });

  await stubLookup(page, { results: [searchResult(), searchResult({ discogsId: 999001 })] });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  await expect(page.getByTestId('result-card')).toHaveCount(2, { timeout: 15_000 });
  expect(marketCalls, 'two results: nothing fetched until asked').toBe(0);

  await page.getByTestId('check-market').first().click();

  await expect(page.getByTestId('market-summary').first()).toContainText('11 for sale');
  expect(marketCalls, 'one card asked, one release fetched').toBe(1);

  // The copy carries §10a's distinctions.
  const summary = await page.getByTestId('market-summary').first().innerText();
  expect(summary).toContain('$47.28');
  expect(summary, 'the floor is an ASKING price, never a worth').toMatch(/asking/i);
  expect(summary, 'the ladder is estimated, not sold').toMatch(/estimates/i);
  expect(summary.toLowerCase()).not.toContain('best dig');
});

test('a single result resolves automatically — the shop case', async ({ page }) => {
  /**
   * §10a's exception. Arriving by catalog number or barcode usually returns one
   * release, and requiring a click to answer the question the search just asked
   * is friction for nothing.
   *
   * **Driven by the RESULT COUNT, not the search shape.** A catalog-number
   * search returning one and a freeform search happening to return one are the
   * same case from the user's side; keying on how the query was built would make
   * the behaviour unpredictable — so this test searches by ARTIST and still
   * expects the auto-resolve.
   */
  let marketCalls = 0;
  await page.route('**/api/discogs/market/**', async (route) => {
    marketCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        numForSale: 3,
        lowestPrice: { value: 12.5, currency: 'USD' },
        conditions: [{ grade: 'Very Good (VG)', value: 18 }],
        range: { low: 18, high: 18 },
        currency: 'USD',
        rangeUnavailable: false,
      }),
    });
  });

  await stubLookup(page, { results: [searchResult()] });

  await page.goto('/lookup');
  await formReady(page);
  // Deliberately a freeform artist search, not a catalog number.
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  await expect(page.getByTestId('market-summary')).toContainText('3 for sale', {
    timeout: 15_000,
  });
  expect(marketCalls, 'exactly one release, fetched once').toBe(1);

  // And no control to press, because it already answered.
  await expect(page.getByTestId('check-market')).toHaveCount(0);
});

test('a missing condition ladder says so rather than showing nothing', async ({ page }) => {
  /**
   * §10a: `price_suggestions` needs completed Discogs seller settings and 404s
   * without them. The app then "shows layer 1 alone and says the range is
   * unavailable; it never interpolates one".
   *
   * An unexplained absence reads as "nobody has priced this record", which is a
   * claim rather than a gap.
   */
  await page.route('**/api/discogs/market/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        numForSale: 11,
        lowestPrice: { value: 47.28, currency: 'USD' },
        conditions: [],
        range: null,
        currency: 'USD',
        rangeUnavailable: true,
      }),
    });
  });

  await stubLookup(page, { results: [searchResult()] });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  const summary = page.getByTestId('market-summary');
  await expect(summary).toContainText('11 for sale', { timeout: 15_000 });
  await expect(summary, 'the gap is named').toContainText(/no condition guide/i);
});


test('the version spread answers "does pressing matter here?"', async ({ page }) => {
  /**
   * §10a layer 3. It rides the expand — one call per version, so it happens
   * when the user opens the table and never before.
   */
  let spreadCalls = 0;
  // Trailing `*`: the spread URL carries `?format=` (§10a), and a glob without
  // it silently stops matching — which unstubs the route rather than failing.
  await page.route('**/api/discogs/master/*/spread*', async (route) => {
    spreadCalls += 1;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        range: { low: 8, high: 400 },
        verdict: 'pressing-matters',
        partial: false,
        text: '11 pressings, $8.00–$400.00. Which pressing you get matters more than the price.',
        checked: 11,
        total: 11,
      }),
    });
  });

  await stubLookup(page, { results: [searchResult()], versions: [versionRow(ORIGINAL)] });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();

  const card = page.getByTestId('result-card').first();
  await expect(card).toBeVisible({ timeout: 15_000 });

  /**
   * §10a's on-demand rule: one call per version, so nothing is fetched until
   * the user opens the table.
   *
   * **The wait is the test.** Checking the counter the instant the card renders
   * proves nothing — a fetch fired on mount has not resolved yet either, so the
   * count is 0 under both the correct code and the broken one. A mutation that
   * moved the fetch into a mount effect passed against exactly that assertion.
   * The settle window is what makes 0 mean "never asked" rather than "not back
   * yet".
   */
  await page.waitForTimeout(1500);
  expect(spreadCalls, 'not fetched until the user opens the table').toBe(0);

  await card.getByTestId('expand-versions').click();

  await expect(page.getByTestId('version-spread')).toContainText('$8.00–$400.00', {
    timeout: 15_000,
  });
  await expect(page.getByTestId('version-spread')).toContainText(/which pressing/i);
  expect(spreadCalls).toBe(1);
});

test('a partial spread says it is partial rather than reading as complete', async ({ page }) => {
  /**
   * The budget runs out mid-fetch: eleven versions against a sixty-per-minute
   * limit, contending with everything else on the page.
   *
   * §10a — a partial spread is still an answer, but presenting an incomplete
   * range as complete is the absent-versus-unknown failure in the layer where
   * the numbers carry the most weight. The reader cannot otherwise tell a
   * master whose versions genuinely cluster from one where the wide end was
   * never fetched.
   */
  // Trailing `*`: the spread URL carries `?format=` (§10a), and a glob without
  // it silently stops matching — which unstubs the route rather than failing.
  await page.route('**/api/discogs/master/*/spread*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        range: { low: 20, high: 25 },
        // Withheld: the unchecked versions could reverse it.
        verdict: null,
        partial: true,
        text: '3 of 11 pressings checked so far — $20.00–$25.00.',
        checked: 3,
        total: 11,
      }),
    });
  });

  await stubLookup(page, { results: [searchResult()], versions: [versionRow(ORIGINAL)] });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();
  await page.getByTestId('result-card').first().getByTestId('expand-versions').click();

  const spread = page.getByTestId('version-spread');
  await expect(spread).toContainText('3 of 11', { timeout: 15_000 });
  await expect(spread, 'the range is provisional').toContainText(/so far/i);

  // No verdict from a third of the evidence.
  await expect(spread).not.toContainText(/barely (changes|matters)/i);
  await expect(spread).not.toContainText(/which pressing you get matters/i);
});

test('the version table states ownership once, and badges only the row you own', async ({
  page,
}) => {
  /**
   * §7.7 as amended: "In a version table, the badge belongs to the table, not
   * to every row."
   *
   * QA found the old behaviour: every non-owned row carried an identical "You
   * own a DIFFERENT pressing / Yours: 1978 US BSK 3266", repeated down the
   * table. Each one was TRUE — the tiers were written for a single candidate,
   * and in a version table every row shares the album, so every unowned row
   * genuinely is a different pressing of something owned. Repeated on all of
   * them it became the table's background rather than a signal about any row.
   *
   * The asymmetry is the point: the unmissable answer is "you own THIS one",
   * and it is unmissable precisely because nothing else is marked.
   */
  const OWNED = 381756;
  const OTHER = 1002;
  const THIRD = 1003;

  const differentPressing: Record<string, unknown> = {
    ...NO_OWNERSHIP,
    tier: 'owned_different_pressing',
    ownedPressing: { year: 1978, country: 'US', catalogNumber: 'BSK 3266' },
  };

  await stubLookup(page, {
    results: [searchResult()],
    versions: [
      versionRow(OWNED, { ...NO_OWNERSHIP, tier: 'owned_exact' }),
      versionRow(OTHER, differentPressing),
      versionRow(THIRD, differentPressing),
    ],
  });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();
  await page.getByTestId('result-card').first().getByTestId('expand-versions').click();

  const rows = page.getByTestId('version-row');
  await expect(rows).toHaveCount(3, { timeout: 15_000 });

  /**
   * ONE badge in the table, on the owned row. The count is the assertion —
   * "the owned row has a badge" would pass with all three badged.
   */
  const badges = page.getByTestId('version-row').getByTestId('ownership-badge');
  await expect(badges, 'only the row actually owned is marked').toHaveCount(1);
  await expect(badges.first()).toContainText(/own this pressing/i);

  // The repeated fact, stated once, where it is context rather than noise.
  const head = page.getByTestId('version-table-summary');
  await expect(head).toContainText('1 already on your shelf');
  await expect(head, 'the owned pressing named once').toContainText('1978');
  await expect(head).toContainText('BSK 3266');

  // And never per-row, which is the defect itself.
  for (const row of await rows.all()) {
    await expect(row, 'the repeated badge is gone').not.toContainText(/DIFFERENT pressing/);
  }
});

test('the version table shows what each pressing costs', async ({ page }) => {
  /**
   * §10a QA: the verdict said "which pressing you get matters more than the
   * price" over a table with no prices in it. True, and unactionable — the user
   * learns the answer varies and has no way to tell WHICH pressing is which.
   *
   * The verdict answers "does this matter"; the column answers "which one".
   *
   * The three states are asserted together because they are the reason this is
   * a formatter rather than a template: a price, "none for sale" (checked,
   * nothing listed) and "—" (never checked) are three different facts, and the
   * last two collapse under any single-branch implementation.
   */
  const CHEAP = 381756;
  const DEAR = 1002;
  const UNSOLD = 1003;

  await page.route('**/api/discogs/master/*/spread*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        range: { low: 1.28, high: 40 },
        verdict: 'pressing-matters',
        partial: false,
        text: '3 pressings, $1.28–$40.00. Which pressing you get matters more than the price.',
        checked: 3,
        total: 3,
        // The fourth row is deliberately ABSENT from prices — never checked.
        prices: { [CHEAP]: 1.28, [DEAR]: 40, [UNSOLD]: null },
      }),
    });
  });

  /**
   * Distinct countries and years so the identical-version grouping keeps them
   * as four rows — collapsing is correct behaviour there (a master's identical
   * versions become one row), and it would hide the very column under test.
   */
  await stubLookup(page, {
    results: [searchResult()],
    versions: [
      { ...versionRow(CHEAP), country: 'UK', year: 1971, catalogNumber: 'AMLS 63502' },
      { ...versionRow(DEAR), country: 'South Korea', year: 1972, catalogNumber: 'OLE-009' },
      { ...versionRow(UNSOLD), country: 'Japan', year: 1973, catalogNumber: 'GP-231' },
      { ...versionRow(1004), country: 'Germany', year: 1974, catalogNumber: 'AMLS 64571' },
    ],
  });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();
  await page.getByTestId('result-card').first().getByTestId('expand-versions').click();

  const rows = page.getByTestId('version-row');
  await expect(rows).toHaveCount(4, { timeout: 15_000 });

  /**
   * The prices arrive AFTER the table. The spread fetch is deliberately not
   * awaited — one call per version must not hold up the rows the user asked
   * for — so the column appears when it resolves.
   */
  await expect(rows.nth(0), 'the cheap pressing').toContainText('$1.28', { timeout: 15_000 });
  await expect(rows.nth(1), 'and the expensive one').toContainText('$40.00');

  // Checked, and nobody is selling it — information, not an absence.
  await expect(rows.nth(2)).toContainText(/none for sale/i);

  // Never checked. Must NOT read as "none for sale".
  await expect(rows.nth(3)).not.toContainText(/none for sale/i);
});

test('the spread asks only about the format in hand', async ({ page }) => {
  /**
   * QA: the Carpenters master priced 8-track cartridges and cassettes beside
   * LPs, so the spread measured the FORMAT and reported it as pressing
   * variance. Comparing a quadraphonic 8-track to a US LP is not a pressing
   * comparison.
   *
   * Asserted on the REQUEST, because that is where the budget is spent —
   * filtering after the fact would still pay for the cassettes.
   */
  let requested: string | null = null;
  await page.route('**/api/discogs/master/*/spread*', async (route) => {
    requested = route.request().url();
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        range: null,
        verdict: null,
        partial: false,
        text: 'None of the pressings checked are for sale right now.',
        checked: 0,
        total: 0,
        prices: {},
      }),
    });
  });

  await stubLookup(page, { results: [searchResult()], versions: [versionRow(ORIGINAL)] });

  await page.goto('/lookup');
  await formReady(page);
  await page.getByLabel('Artist').fill('Discharge');
  await page.getByRole('button', { name: 'Search Discogs' }).click();
  await page.getByTestId('result-card').first().getByTestId('expand-versions').click();

  await expect(page.getByTestId('version-spread')).toBeVisible({ timeout: 15_000 });

  expect(requested, 'the medium travels with the request').toContain('format=Vinyl');
});
