import { expect, test, type Page } from '@playwright/test';
import { seedDiscogsCache } from './seed';

/**
 * SPEC.md §10: `/records/new` is "Form prefilled from a lookup result, or blank
 * for manual entry. **All prefilled fields remain editable** — the user
 * verifies against the physical record and corrects."
 *
 * That is §5.7's two-stage import seen from the screen.
 *
 * **The release is seeded into `discogs_cache` from the COMMITTED FIXTURE**,
 * not stubbed at the browser. Two reasons, and the first is a correction:
 *
 *   - a `page.route` stub does not cover server components, so the first
 *     version of this file let a live call reach api.discogs.com. The guard in
 *     `no-live-calls.ts` now refuses that outright, which is why these specs
 *     failed until they stopped depending on it.
 *   - the fixture is what Discogs actually sent. Release 381756 carries EIGHT
 *     Matrix / Runout variants — two sides across four documented pressings —
 *     where a hand-written stub would have carried one. Code assuming one
 *     would have passed a stubbed test and shipped.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** Every Matrix / Runout value on release 381756, joined as the form shows them. */
const ALL_EIGHT_MATRIX_VARIANTS = [
  'BACK WITH BILBO CLAY-LP-3-A2 DAMONT',
  'TOTAL BLITZ  BILBO TAPEONE CLAY-LP-3-B2 DAMONT',
  '> BACK WITH BILBO CLAY-LP-3-A2 DAMONT',
  'X TOTAL BLITZ  BILBO TAPEONE CLAY-LP-3-B2 DAMONT',
  '3  BACK WITH BILBO  CLAY-LP-3-A²  DAMONT',
  'O  TOTAL BLITZ  BILBO TAPEONE  CLAY-LP-3-B²  DAMONT',
  'W  BACK WITH BILBO  CLAY-LP-3-A²  DAMONT',
  'Y  TOTAL BLITZ  BILBO TAPEONE  CLAY-LP-3-B²  DAMONT',
].join(' / ');

/**
 * Release 381756, from the committed fixture.
 *
 * Seeded per TEST rather than once per file. Playwright runs specs in parallel
 * workers against one database, so a `beforeAll` seed with an `afterAll`
 * cleanup removes the row while a sibling test is still using it — which
 * produced three different failures on three consecutive runs. The
 * cross-spec fixture rule from NOTES, met inside a single file.
 *
 * The upsert makes re-seeding harmless, and nothing deletes it mid-run.
 */
let releaseId: number;

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

async function formReady(page: Page): Promise<void> {
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
}

// Once per worker: per-test seeding exhausted database connections under a
// full parallel run. The upsert makes re-seeding harmless and nothing deletes
// the row, so a sibling worker cannot be left without it.
test.beforeAll(async () => {
  releaseId = await seedDiscogsCache('release-detailed');
});

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('prefills the record form from a Discogs release', async ({ page }) => {
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await expect(page.getByLabel('Title')).toHaveValue('Hear Nothing See Nothing Say Nothing');
  await expect(page.getByLabel('Release year')).toHaveValue('1982');
});

test('prefills the pressing section, which is what identifies the copy', async ({ page }) => {
  /**
   * §10 puts pressing details on this form deliberately — "not on a separate
   * screen". They are what distinguishes the 1982 original from the 1989
   * reissue sharing its catalog number, so a prefill that dropped them would
   * leave the user retyping the fields the lookup existed to find.
   */
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await expect(page.getByLabel('Catalog no.')).toHaveValue('CLAY LP 3');
  await expect(page.getByLabel('Country')).toHaveValue('UK');
  await expect(page.getByLabel('Year pressed')).toHaveValue('1982');
  await expect(page.getByLabel('Pressing plant')).toHaveValue('Damont');
});

test('carries every matrix variant, not just the first', async ({ page }) => {
  /**
   * THE case a stub would have hidden. Release 381756 documents eight runout
   * variants across two sides; the column holds one string, so they are joined
   * rather than truncated.
   *
   * Keeping only the first would discard the side the user is looking at —
   * and the matrix is what CLAUDE.md §8 calls user-authoritative, the field
   * that identifies a pressing when catalog numbers agree. My original stub
   * carried a single variant and this test would have passed against code that
   * dropped seven.
   */
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  const matrix = page.getByLabel('Matrix / runout');

  await expect(matrix).toHaveValue(ALL_EIGHT_MATRIX_VARIANTS);
  await expect(matrix, 'the B-side variants survive').toHaveValue(/TOTAL BLITZ/);
});

test('every prefilled field stays editable', async ({ page }) => {
  /**
   * §10 says so in as many words, and §5.7 explains why: the user may be
   * holding a different pressing than the one they searched, and Discogs is
   * user-submitted data that is "a strong starting point, never proof".
   */
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  // The starting state has to be the PREFILLED one, or this cannot tell
  // editing from typing into an empty form — it passed against the
  // unprefilled build on its first run.
  await expect(page.getByLabel('Title')).toHaveValue('Hear Nothing See Nothing Say Nothing');
  await expect(page.getByLabel('Matrix / runout')).toHaveValue(ALL_EIGHT_MATRIX_VARIANTS);

  await page.getByLabel('Matrix / runout').fill('MY OWN READING FROM THE WAX');
  await expect(page.getByLabel('Matrix / runout')).toHaveValue('MY OWN READING FROM THE WAX');

  await page.getByLabel('Title').fill('Hear Nothing (my copy)');
  await expect(page.getByLabel('Title')).toHaveValue('Hear Nothing (my copy)');
});

test('saves what the user confirmed, not what Discogs said', async ({ page }) => {
  /**
   * The property the two-stage flow exists for. The user corrects the matrix
   * from the dead wax and the saved record carries THEIR value — §7.8, and the
   * one rule in this step where being wrong destroys something typed by hand.
   */
  /**
   * The artist has to exist for the form to submit — `artist_id` is required
   * (§4.2) and the prefill deliberately MATCHES rather than creates. Created
   * here through the API, which is how the inline "+ New artist" control does
   * it, so the flow under test is the save rather than the artist creation.
   */
  /**
   * NOT named "Discharge …". An earlier version was, and the prefill's
   * fuzzy name match then found it — so the unmatched-artist test below stopped
   * seeing its notice. The fixture rule between tests: this spec's artist must
   * be one nothing else can match.
   */
  const artist = await page.request.post('/api/artists', {
    data: { name: `Save Fixture ${Date.now().toString(36)}` },
  });
  const artistId = (await artist.json()).id;

  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await page.getByLabel('Artist', { exact: true }).selectOption(artistId);
  await page.getByLabel('Matrix / runout').fill('CORRECTED A1/B1 VARIANT 3');
  await page.getByRole('button', { name: /Add record|Add to collection/ }).click();

  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const recordId = page.url().split('/').pop();
  const record = await (await page.request.get(`/api/records/${recordId}`)).json();

  expect(record.pressing?.matrixRunout).toBe('CORRECTED A1/B1 VARIANT 3');
  expect(record.title).toBe('Hear Nothing See Nothing Say Nothing');
});

test('names an artist it could not match, rather than leaving a silent blank', async ({ page }) => {
  /**
   * The prefill MATCHES reference rows, never creates them: a prefill is not a
   * commitment, and creating an artist for a form the user abandons leaves
   * debris nothing points at.
   *
   * So an unknown artist leaves the select empty — and the screen has to say
   * why, or the user sees a blank field with no way to know whether the lookup
   * failed or the artist genuinely has no name.
   */
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await expect(page.getByTestId('unmatched-artist')).toContainText('Discharge');
});

test('a blank form still works for manual entry', async ({ page }) => {
  // §10: "or blank for manual entry". The prefill is an addition, not a
  // precondition — the in-store case must stay enterable without a lookup.
  await page.goto('/records/new');
  await formReady(page);

  await expect(page.getByLabel('Title')).toHaveValue('');
  await expect(page.getByLabel('Catalog no.')).toHaveValue('');
});

test('an unknown release does not leave a half-filled form', async ({ page }) => {
  /**
   * Nothing cached and the guard refusing the fetch: the form must not carry
   * some fields and not others, or the user cannot tell which came from the
   * lookup and which they still have to check.
   */
  await page.goto('/records/new?discogsReleaseId=99999999');
  await formReady(page);

  await expect(page.getByLabel('Title')).toHaveValue('');
  await expect(page.getByTestId('prefill-failed')).toBeVisible();
});

test('the want-list form prefills from a Discogs release too', async ({ page }) => {
  /**
   * §10's `/want-list/new`, "prefilled from a `/lookup` result via
   * `?discogsReleaseId=`". This is the destination of the lookup card's "Add
   * to want list" action, which 404'd until the screen existed.
   */
  await page.goto(`/want-list/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await expect(page.getByLabel('Title')).toHaveValue('Hear Nothing See Nothing Say Nothing');
});

test('keeps best-dig notes and max price in separate sections', async ({ page }) => {
  /**
   * §10 states §7.2's separation as a screen requirement, and this asserts it
   * where the user meets it. `want-list-form.test.ts` pins the structure; this
   * confirms the structure is what actually renders — the wiring lesson from
   * unit 4, where a route returning raw payloads left every pure-function test
   * green.
   */
  await page.goto('/want-list/new');
  await formReady(page);

  const dig = page.getByTestId('section-best-dig');
  const ceiling = page.getByTestId('section-ceiling');

  await expect(dig).toBeVisible();
  await expect(ceiling).toBeVisible();

  // The price field is NOT inside the dig section — the specific collapse
  // CLAUDE.md §8 forbids.
  await expect(dig.getByLabel(/Most I'll pay/)).toHaveCount(0);
  await expect(ceiling.getByLabel(/Most I'll pay/)).toHaveCount(1);
});

test('saves a want-list item with both §7.2 fields distinct', async ({ page }) => {
  const suffix = Date.now().toString(36);
  const artist = await page.request.post('/api/artists', {
    data: { name: `Wanted Fixture ${suffix}` },
  });
  const artistId = (await artist.json()).id;

  await page.goto('/want-list/new');
  await formReady(page);

  await page.getByLabel('Title').fill(`Why ${suffix}`);
  await page.getByLabel('Artist').selectOption(artistId);
  await page.getByLabel(/Best dig/).fill('UK first press, Porky stamp');
  await page.getByLabel(/Most I'll pay/).fill('40.00');
  await page.getByRole('button', { name: 'Add to want list' }).click();

  await expect(page).toHaveURL('/want-list', { timeout: 15_000 });

  const items = await (await page.request.get('/api/want-list')).json();
  const saved = items.data.find((row: { title: string }) => row.title === `Why ${suffix}`);

  expect(saved, 'the item was created').toBeDefined();
  expect(saved.bestDigNotes).toBe('UK first press, Porky stamp');
  expect(saved.maxPrice, 'a string, so the cents survive').toBe('40.00');
});

test('prefills the FORMAT select, matched from Discogs descriptors', async ({ page }) => {
  /**
   * FOUND IN REAL USE: imported records had no format. §6's mapping names
   * `formats[0].name`, which holds the MEDIUM ("Vinyl") — the format we seed
   * is in the descriptions ("LP").
   *
   * Asserted at the rendered form rather than only in the prefill, per the
   * seam rule: a correct mapping that never reaches the select is the same
   * defect from the user's side.
   */
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  const format = page.getByLabel('Format');
  await expect(format).not.toHaveValue('');

  // The LP row, by name — not merely "something is selected".
  await expect(format.locator('option:checked')).toHaveText('LP');
});
