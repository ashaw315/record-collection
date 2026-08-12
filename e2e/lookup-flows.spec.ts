import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { seedDiscogsCache } from './seed';

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
function versionRow(discogsId: number, ownership = NO_OWNERSHIP) {
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

