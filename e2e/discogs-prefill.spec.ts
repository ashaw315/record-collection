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

  /**
   * **The field starts EMPTY and the variants are shown beside it.**
   *
   * This test previously asserted the eight joined variants were prefilled
   * INTO the field, and that was the wrong behaviour rather than a wrong test.
   * §5.7: the matrix is "frequently missing or partial — always let the user
   * hand-enter it from the dead wax". Eight variants across FOUR documented
   * pressings is not this user's record; accepting it wholesale writes a
   * fingerprint describing no physical object, into the field §4 calls "the
   * true pressing fingerprint". A prefilled field also reads as verified,
   * which inverts the instruction.
   *
   * The variants are still worth showing — they are what Discogs has on
   * record, and useful while reading the wax — so they move to reference text.
   */
  await expect(page.getByLabel('Matrix / runout')).toHaveValue('');

  const reference = page.getByTestId('matrix-reference');
  await expect(reference).toContainText('BACK WITH BILBO');
  await expect(reference, 'the B-side variants are still shown').toContainText('TOTAL BLITZ');
  await expect(reference, 'all eight, not just the first').toContainText(
    ALL_EIGHT_MATRIX_VARIANTS,
  );
});

test('the matrix reference is not a value that can be saved by accident', async ({ page }) => {
  /**
   * The discriminating case: reference text and a prefilled value look similar
   * on screen and behave completely differently on save. Saving with the field
   * untouched must record NO matrix, not Discogs' eight.
   */
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await expect(page.getByTestId('matrix-reference')).toContainText('BACK WITH BILBO');

  // Nothing in the form's actual inputs carries the reference text.
  const values = await page
    .locator('form input, form textarea')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement | HTMLTextAreaElement).value).join('|'),
    );
  expect(values, 'the reference must not be sitting in any input').not.toContain(
    'BACK WITH BILBO',
  );
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
  // Catalog number rather than matrix: the matrix is deliberately NOT prefilled
  // (see above), so it can no longer carry this test's point about editing a
  // PREFILLED field. Its own editability is covered below.
  await expect(page.getByLabel('Catalog no.')).toHaveValue('CLAY LP 3');

  await page.getByLabel('Catalog no.').fill('CLAY LP 3 (my copy)');
  await expect(page.getByLabel('Catalog no.')).toHaveValue('CLAY LP 3 (my copy)');

  // The empty matrix still accepts what the user reads off the wax.
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
  /**
   * **Its OWN release, not the shared `release-detailed` one.**
   *
   * §4 makes `pressings` shared and found-or-create, and SPEC.md §7.6 is
   * explicit that a row carrying a `discogs_release_id` is *the* row for that
   * release — user edits must not win on it, or "one person's correction is
   * written onto every record that matches the same release".
   *
   * `lookup-flows.spec.ts` imports release 381756 too. Whichever spec ran first
   * created that pressing, and the second attached to it and read back the
   * FIRST one's matrix. This test passed for as long as it happened to run
   * first, and failed deterministically on both projects once it did not — the
   * app was correct throughout.
   *
   * Release 27522408 is imported by nothing else, so the pressing this test
   * creates is its own and the assertion is about the save rather than about
   * which spec won a race.
   */
  const ownReleaseId = await seedDiscogsCache('release-no-matrix');

  const artist = await page.request.post('/api/artists', {
    data: { name: `Save Fixture ${Date.now().toString(36)}` },
  });
  const artistId = (await artist.json()).id;

  await page.goto(`/records/new?discogsReleaseId=${ownReleaseId}`);
  await formReady(page);

  await page.getByLabel('Artist', { exact: true }).selectOption(artistId);
  await page.getByLabel('Matrix / runout').fill('CORRECTED A1/B1 VARIANT 3');
  await page.getByRole('button', { name: /Add record|Add to collection/ }).click();

  /**
   * NOT anchored with `$`: a save whose Discogs cover could not be fetched
   * lands on `?cover=failed`, which is the notice telling the user so. The
   * record id is what this assertion is about.
   */
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}(\?|$)/, { timeout: 15_000 });

  const recordId = page.url().split('/').pop();
  const record = await (await page.request.get(`/api/records/${recordId}`)).json();

  expect(record.pressing?.matrixRunout).toBe('CORRECTED A1/B1 VARIANT 3');
  expect(record.title).toBe('Moonglow Bay Original Soundtrack');
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
  /**
   * A release nothing in the E2E suite SAVES.
   *
   * These assert an artist and label are UNMATCHED — a claim about the whole
   * database, not about this spec's own rows. The suffix convention cannot
   * help: a Discogs fixture's artist name is a FIXED EXTERNAL KEY, so any spec
   * that saves the same release find-or-creates the same rows.
   *
   * Two collisions, found in order: 381756 once the form began posting to
   * `/api/discogs/import` (§5.7 stage two), then 27522408, which the
   * matrix-save test above saves. 12856557 is opened by nobody and saved by
   * nobody — reading a release does not create rows; only saving does.
   *
   * Same rule as the shared-pressing collision in NOTES, one table over.
   */
  const soloReleaseId = await seedDiscogsCache('release-no-year');

  await page.goto(`/records/new?discogsReleaseId=${soloReleaseId}`);
  await formReady(page);

  await expect(page.getByTestId('unmatched-artist')).toContainText('Carpenters');
});

test('an unmatched name is waiting in the inline-create box, not a dead end', async ({ page }) => {
  /**
   * The QA finding this exists for: "match, never create" is right, but an
   * unmatched label was DROPPED silently and the only recourse was to leave the
   * form, add the label in /manage, and re-import — losing everything typed.
   * On a new collection nothing matches, so every import lost its label.
   *
   * The name Discogs gave is placed in the inline-create field, open and ready.
   * **Nothing is created until the user clicks Add**, so the principle holds:
   * abandoning the form still leaves no debris.
   */
  /**
   * A release nothing in the E2E suite SAVES.
   *
   * These assert an artist and label are UNMATCHED — a claim about the whole
   * database, not about this spec's own rows. The suffix convention cannot
   * help: a Discogs fixture's artist name is a FIXED EXTERNAL KEY, so any spec
   * that saves the same release find-or-creates the same rows.
   *
   * Two collisions, found in order: 381756 once the form began posting to
   * `/api/discogs/import` (§5.7 stage two), then 27522408, which the
   * matrix-save test above saves. 12856557 is opened by nobody and saved by
   * nobody — reading a release does not create rows; only saving does.
   *
   * Same rule as the shared-pressing collision in NOTES, one table over.
   */
  const soloReleaseId = await seedDiscogsCache('release-no-year');

  await page.goto(`/records/new?discogsReleaseId=${soloReleaseId}`);
  await formReady(page);

  // Open and populated, rather than a hint pointing somewhere else.
  await expect(page.getByLabel('New artist name')).toHaveValue('Carpenters');
  await expect(page.getByLabel('New label name')).toHaveValue('A&M Records');

  // The select is still empty: suggesting is not selecting.
  await expect(page.getByLabel('Artist', { exact: true })).toHaveValue('');
});

test('the suggested name creates nothing until the user acts on it', async ({ page }) => {
  /**
   * The half that protects the principle. A suggestion that quietly created the
   * row would be the debris `loadDiscogsPrefill` deliberately avoids — and it
   * would be invisible, since the form looks identical either way.
   */
  /**
   * A release nothing in the E2E suite SAVES.
   *
   * These assert an artist and label are UNMATCHED — a claim about the whole
   * database, not about this spec's own rows. The suffix convention cannot
   * help: a Discogs fixture's artist name is a FIXED EXTERNAL KEY, so any spec
   * that saves the same release find-or-creates the same rows.
   *
   * Two collisions, found in order: 381756 once the form began posting to
   * `/api/discogs/import` (§5.7 stage two), then 27522408, which the
   * matrix-save test above saves. 12856557 is opened by nobody and saved by
   * nobody — reading a release does not create rows; only saving does.
   *
   * Same rule as the shared-pressing collision in NOTES, one table over.
   */
  const soloReleaseId = await seedDiscogsCache('release-no-year');

  await page.goto(`/records/new?discogsReleaseId=${soloReleaseId}`);
  await formReady(page);
  await expect(page.getByLabel('New label name')).toHaveValue('A&M Records');

  // Leave without acting. Nothing may have been written.
  const before = await (await page.request.get('/api/labels')).json();
  const names = (before.data ?? before).map((row: { name: string }) => row.name);
  expect(names, 'the suggestion must not have created the label').not.toContain('A&M Records');
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

test('an imported record carries its Discogs genres onto the collection screen', async ({
  page,
}) => {
  /**
   * **The end of the chain, in a browser.** The QA finding was that imported
   * records had no genres — and everything downstream of `record_genres` was
   * correct and starved: §7.1's hierarchy, the facet chips, `matchedVia`, and
   * steps 10-12.
   *
   * Integration tests now cover import → `record_genres` → `listRecords`. This
   * covers the part none of them can see: that a user going through the FORM
   * ends up with chips on screen. That gap is exactly how §6's mapping sat
   * implemented, tested and unreachable.
   *
   * Asserts BOTH the style and the parent genre. Release 381756 is
   * `genres: ["Rock"]`, `styles: ["Hardcore", "Punk"]` — an implementation
   * reading only `genres` shows "Rock" and passes any test that merely checks a
   * chip exists, while filing a hardcore record under the parent. That is the
   * distinction CLAUDE.md §8 exists to protect.
   */
  const artist = await page.request.post('/api/artists', {
    data: { name: `Genre Fixture ${Date.now().toString(36)}` },
  });
  const artistId = (await artist.json()).id;

  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  /**
   * **Asserted BEFORE the save, which is the blind spot this guard had.**
   *
   * The first version checked only post-save state, and passed while the form's
   * Genres row was empty — because the import transaction derives genres from
   * the release regardless of what the form sends. Chips appeared afterwards;
   * nothing was visible or editable beforehand.
   *
   * That defeats §5.7's two-stage flow, whose whole point is verifying before
   * committing. A record filed under genres the user never saw is CLAUDE.md
   * §8's concern arriving by omission rather than by error.
   */
  for (const name of ['Hardcore', 'Punk', 'Rock']) {
    await expect(
      page.getByRole('checkbox', { name, exact: true }),
      `${name} is offered on the form`,
    ).toBeChecked();
  }

  await page.getByLabel('Artist', { exact: true }).selectOption(artistId);
  await page.getByRole('button', { name: /Add record|Add to collection/ }).click();

  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}(\?|$)/, { timeout: 20_000 });

  const recordId = new URL(page.url()).pathname.split('/').pop() ?? '';
  const record = await (await page.request.get(`/api/records/${recordId}`)).json();
  const names = (record.genres ?? []).map((genre: { name: string }) => genre.name).sort();

  expect(names, 'the style survives, not just the parent genre').toEqual([
    'Hardcore',
    'Punk',
    'Rock',
  ]);

  // And they are visible on the record, which is what the user actually sees.
  await expect(page.getByText('Hardcore')).toBeVisible();
});

test('Discogs notes are shown beside the field, never inside it', async ({ page }) => {
  /**
   * The release-versus-copy distinction (NOTES: "a Discogs field describing the
   * CATALOGUE OBJECT belongs beside our field").
   *
   * Discogs' `notes` describe the RELEASE — sleeve text, gatefold, publishing,
   * copyright — which is true of every copy ever pressed. `records.notes` is
   * the user's note about THEIR copy. Prefilling one into the other fills a
   * personal field with boilerplate, reads as verified when it is not, and
   * makes §7.8 unenforceable: a re-import cannot tell whose text it is.
   *
   * Second instance of the treatment established for the matrix in step 7.
   * §6's mapping does not import `notes` at all, so nothing is lost by showing
   * rather than filling.
   */
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await expect(page.getByLabel('Notes')).toHaveValue('');

  const reference = page.getByTestId('notes-reference');
  await expect(reference).toContainText('Pay no more than');
  await expect(reference, 'the whole note, not the first line').toContainText('Gatefold sleeve');
});

test('the notes reference cannot be saved by leaving the field untouched', async ({ page }) => {
  // Reference text and a prefilled value look similar and behave completely
  // differently on save. Saving untouched must record NO note.
  await page.goto(`/records/new?discogsReleaseId=${releaseId}`);
  await formReady(page);

  await expect(page.getByTestId('notes-reference')).toContainText('Pay no more than');

  const values = await page
    .locator('form input, form textarea')
    .evaluateAll((nodes) =>
      nodes.map((node) => (node as HTMLInputElement | HTMLTextAreaElement).value).join('|'),
    );

  expect(values, 'the reference must not sit in any input').not.toContain('Pay no more than');
});

test('a release with no notes shows no reference at all', async ({ page }) => {
  // Absence rendered as absence. An empty "Discogs lists:" label would assert
  // that Discogs said something.
  const quiet = await seedDiscogsCache('release-no-year');

  await page.goto(`/records/new?discogsReleaseId=${quiet}`);
  await formReady(page);

  await expect(page.getByTestId('notes-reference')).toHaveCount(0);
});
