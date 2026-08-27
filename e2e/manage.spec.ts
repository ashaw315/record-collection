import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedMatchCandidate } from './seed';

/* Records and artists removed after each test — see e2e/cleanup.ts. */
registerCleanup();

/**
 * SPEC.md §10 `/manage`. These cover what only exists in a browser: inline
 * create/edit/delete, the disabled affordance on seeded formats, a genre
 * reparent through the move select, and a rejected cycle.
 *
 * Playwright runs every spec under both the `chromium` and `mobile` projects
 * (see playwright.config.ts), so mobile is not an opt-in pass — a control that
 * only works with a mouse fails here.
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

/** The row's own name cell, not the <option> copies inside every move select. */
function genreRow(page: Page, name: string) {
  return page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Edit ${name}` }) });
}

async function openResource(page: Page, label: string, search = '') {
  // The goto lives HERE, so a caller must pass its query string through rather
  // than navigating first — this helper would overwrite that navigation.
  await page.goto(`/manage${search}`);
  await page.getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('region', { name: label })).toBeVisible();
}

/** Unique per run so repeated runs against one database do not collide. */
function unique(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
}

/**
 * Deletes genres by name, children first — a parent with children is refused by
 * the §7.4 in-use rule, so order matters.
 */
async function cleanupGenres(request: APIRequestContext, names: string[]) {
  const body = (await (await request.get('/api/genres?pageSize=200')).json()) as {
    data?: Array<{ id: string; name: string }>;
  };

  for (const name of names) {
    const match = body.data?.find((row) => row.name === name);
    if (match !== undefined) {
      await request.delete(`/api/genres/${match.id}`, { failOnStatusCode: false });
    }
  }
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('creates, renames and deletes a tag inline', async ({ page }) => {
  const name = unique('e2e-tag');
  const renamed = `${name}-renamed`;

  await openResource(page, 'Tags');

  await page.getByLabel('New tag name').fill(name);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(page.getByRole('cell', { name, exact: true })).toBeVisible({ timeout: 15_000 });

  // Edit happens in place — no navigation.
  await page.getByRole('button', { name: `Edit ${name}` }).click();
  const field = page.getByLabel(`${name} name`);
  await field.fill(renamed);
  await field.press('Enter');
  await expect(page.getByRole('cell', { name: renamed, exact: true })).toBeVisible({
    timeout: 15_000,
  });

  await page.getByRole('button', { name: `Delete ${renamed}` }).click();
  await page.getByTestId('confirm-delete').click();
  await expect(page.getByRole('cell', { name: renamed, exact: true })).toBeHidden({
    timeout: 15_000,
  });
});

test('explains a refused delete with a count, not a code', async ({ page }) => {
  /**
   * `page.request`, not the standalone `request` fixture: the latter is a
   * separate context with NO session cookie, so every call it makes is a 401.
   * The original version of this test used it and was skipped, so nothing
   * noticed — it only surfaced once the skip was removed.
   */
  // A tag in use by a record: the API returns 409 IN_USE with referenceCount,
  // and the screen must turn that into a sentence.
  const tagName = unique('e2e-inuse');
  const artistName = unique('e2e-artist');

  const tag = await page.request.post('/api/tags', { data: { name: tagName } });
  const artist = await page.request.post('/api/artists', { data: { name: artistName } });
  trackArtist(((await artist.json()) as { id: string }).id);
  trackArtist(((await artist.json()) as { id: string }).id);

  // Attached via the nested tagIds the records endpoint accepts (§5.2) — there
  // is no separate /records/:id/tags route, and inventing one in a test would
  // assert against an API that does not exist.
  const record = await page.request.post('/api/records', {
    data: {
      title: unique('e2e-record'),
      artistId: (await artist.json()).id,
      tagIds: [(await tag.json()).id],
    },
    failOnStatusCode: false,
  });
  expect(record.status()).toBe(201);

  await openResource(page, 'Tags');
  await page.getByRole('button', { name: `Delete ${tagName}` }).click();
  await page.getByTestId('confirm-delete').click();

  // Scoped to the row's own alert: the create row above also renders one, so a
  // bare getByRole('alert') is ambiguous.
  const alert = page.getByRole('alert').filter({ hasText: /delete/i });
  await expect(alert).toContainText(/use|used/);
  await expect(alert).not.toContainText('IN_USE');
  await expect(alert).toContainText('1 record');
});

test('shows a seeded format as disabled rather than a button that errors', async ({ page }) => {
  await openResource(page, 'Formats');

  const del = page.getByRole('button', { name: 'Delete LP' });
  await expect(del).toHaveAttribute('aria-disabled', 'true');

  // The row says so too, so the reason survives without hovering — which a
  // touch device cannot do.
  await expect(page.getByRole('cell', { name: /LP/ }).first()).toContainText('Built in');
});

/**
 * **These two were documented as QUARANTINED and were never skipped.**
 *
 * The docblock here said "they are skipped honestly" and "do not un-skip
 * without a diagnosis" — but there was no `test.skip` anywhere in this file, so
 * both ran on every invocation. With `retries: 1` in `playwright.config.ts`, a
 * test that failed once and passed on retry reports as "flaky" and the run
 * still exits 0, so the documented ~50% failure was absorbed silently and the
 * file described a quarantine that did not exist.
 *
 * That is worse than either honest option. A skipped test is visibly absent; a
 * red one stops the build. A test that is believed skipped, actually runs, and
 * has its failures swallowed by a retry gives false readings in both
 * directions: nobody trusts it, and nobody sees it fail either.
 *
 * **Re-measured before rewriting this**, rather than trusting either the old
 * note or the assumption that it was stale: `--retries=0` across the FULL
 * suite, twice, 326 passed 0 failed both times; and `--repeat-each=4` on this
 * file alone, 48/48. The flake does not currently reproduce. Since the note was
 * written the shared-genre-row contention it guessed at has changed —
 * `cleanupGenres` now removes both rows at the end of each spec.
 *
 * The old hypothesis is kept because it is still a live warning: serializing
 * Playwright was tried and DISPROVEN (0/4 clean either way). Do not re-apply
 * that config change without new evidence.
 *
 * If these fail again, the honest move is `test.fixme` — which actually skips —
 * not a comment saying they are skipped.
 */
test('moves a genre under another with the select, on touch and pointer alike', async ({
  page,
  request,
}) => {
  const parent = unique('e2e-parent');
  const child = unique('e2e-child');
  /**
   * **A DECOY, and it is what makes this test discriminating.**
   *
   * With only one candidate parent on screen, "moved under the right genre" and
   * "moved under any genre" are the same observation, so no assertion could
   * tell them apart. Mutation-verified: pointing the move handler at
   * `parents[0]` instead of the chosen value passes every assertion when one
   * parent exists, and fails once a second one does.
   *
   * Named to sort BEFORE the real parent, so a handler taking the first option
   * takes the wrong one.
   */
  const decoy = unique('e2e-aaa-decoy');

  await openResource(page, 'Genres');

  for (const name of [decoy, parent]) {
    await page.getByLabel('New genre name').fill(name);
    await page.getByRole('button', { name: 'Add' }).click();
    await expect(genreRow(page, name)).toBeVisible({ timeout: 15_000 });
  }

  await page.getByLabel('New genre name').fill(child);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(genreRow(page, child)).toBeVisible({ timeout: 15_000 });

  /**
   * The parent's id, read from the option the select offers, so the assertion
   * below can name WHICH parent rather than merely "some non-empty value".
   */
  const childSelect = page.getByRole('combobox', { name: `Move ${child} under` });
  const parentId = await childSelect
    .getByRole('option', { name: parent, exact: true })
    .getAttribute('value');
  expect(parentId, 'the parent must be offered before it can be chosen').toBeTruthy();

  // A native select, so this is the same interaction on every device — there is
  // no drag path and therefore no untested fallback.
  await childSelect.selectOption({ label: parent });

  /**
   * **`toHaveValue(parentId)`, not `toHaveValue(/.+/)`.**
   *
   * The old assertion was weaker than its title, though not in the way it first
   * appears and not vacuously. `value` is `node.parentGenreId ?? ''`, so a
   * top-level genre holds `''` and `/.+/` correctly REJECTS the unchanged case
   * — measured, not assumed, and a no-op move handler does fail it.
   *
   * What `/.+/` could not see is WHICH genre the child moved under. Mutation
   * testing, with all three variants run:
   *
   *   handler → no-op                    old FAILS, new FAILS
   *   handler → always `parents[0]`,
   *     one candidate parent on screen   old PASSES, new PASSES  (inert)
   *   handler → always `parents[0]`,
   *     with the decoy above             old PASSES, new FAILS
   *
   * The third row is the whole point: a test titled "moves a genre under
   * another" passed while the child was moved under an unrelated genre. And the
   * second row is why the decoy exists — with one candidate parent, "the right
   * one" and "any one" are the same observation and no assertion can separate
   * them.
   */
  await expect(childSelect).toHaveValue(parentId ?? '');

  /**
   * And the TREE re-nested, which is the thing the user came for. The select is
   * a control; `aria-level` is the outcome. Asserting only the control would
   * pass if the value stuck locally and the move never reached the server.
   */
  await expect(genreRow(page, child)).toHaveAttribute('aria-level', '2');
  await expect(genreRow(page, parent)).toHaveAttribute('aria-level', '1');

  // These rows live in the dev database, which E2E does not truncate. Removing
  // them keeps repeat runs from accumulating and keeps the move selects short.
  await cleanupGenres(request, [child, parent, decoy]);
});

/** Was documented as quarantined alongside the spec above — see that note. */
test('the move select never offers a genre its own descendant', async ({ page, request }) => {
  const parent = unique('e2e-cyc-parent');
  const child = unique('e2e-cyc-child');

  await openResource(page, 'Genres');

  await page.getByLabel('New genre name').fill(parent);
  await page.getByRole('button', { name: 'Add' }).click();
  await page.getByLabel('New genre name').fill(child);
  await page.getByRole('button', { name: 'Add' }).click();

  await page.getByRole('combobox', { name: `Move ${child} under` }).selectOption({ label: parent });

  // The parent's own select must not list its child: offering the move only to
  // have the API reject it is worse than not offering it.
  // The parent row must exist before its select can be read.
  await expect(genreRow(page, parent)).toBeVisible({ timeout: 15_000 });
  const parentSelect = page.getByRole('combobox', { name: `Move ${parent} under` });
  await expect(parentSelect.getByRole('option', { name: child })).toHaveCount(0);

  await cleanupGenres(request, [child, parent]);
});

test('the resource rail is reachable on a narrow viewport', async ({ page }) => {
  // §10 makes mobile an equal priority. The rail scrolls horizontally rather
  // than collapsing into a separate mobile navigation, so every resource is
  // reachable with the same control.
  await page.goto('/manage');

  const genres = page.getByRole('button', { name: 'Genres', exact: true });
  await genres.scrollIntoViewIfNeeded();
  await genres.click();

  await expect(page.getByRole('region', { name: 'Genres' })).toBeVisible();
});

test('the duplicate-artist review shows enough to decide, and decline is as easy as merge', async ({
  page,
}) => {
  /**
   * SPEC.md §4.3's review. Two properties, and they are the unit:
   *
   * 1. **Names cannot be the evidence.** The pair is a candidate BECAUSE the
   *    names are identical, so a review showing two names shows nothing.
   * 2. **"Distinct" must be as easy as "merge".** A wrong merge is invisible
   *    and self-reinforcing; a wrong decline is visible and cheap. If declining
   *    took more clicks the review would become a merge button with extra
   *    steps.
   */
  const suffix = `${Date.now()}`;
  const name = `Discharge ${suffix}`;
  await seedMatchCandidate({
    name,
    importedMbid: `mbid-${suffix}`,
    localRecordTitle: `Hear Nothing ${suffix}`,
  });

  await page.goto('/manage');

  const review = page.getByTestId('match-review');
  await expect(review).toBeVisible({ timeout: 15_000 });

  /**
   * Scoped by NAME, never `.first()`.
   *
   * `.first()` grabs whichever pair renders first, which is this test's only
   * when no other test has an open candidate — it passed or failed on worker
   * ordering, and did fail once in a full run. Same defect class as the two
   * recorded flakes: a test whose result depends on what else ran.
   */
  const row = review.getByTestId('match-candidate').filter({ hasText: name });
  await expect(row).toHaveCount(1);

  // The context that actually separates them — never just the name.
  await expect(row, 'the MusicBrainz id').toContainText(`mbid-${suffix}`);
  await expect(row, 'the record count on the local side').toContainText(/1 record/);
  await expect(row, 'and where it is from').toContainText('GB');

  // Both answers present, both one click.
  const merge = row.getByRole('button', { name: /same artist/i });
  const distinct = row.getByRole('button', { name: /different artists/i });
  await expect(merge).toBeVisible();
  await expect(distinct).toBeVisible();

  await distinct.click();

  // Answered and gone — asserted on THIS pair, since another test's candidate
  // may legitimately be open at the same time.
  await expect(row).toHaveCount(0, { timeout: 15_000 });

  await page.reload();
  await expect(
    page.getByTestId('match-candidate').filter({ hasText: name }),
    'still answered',
  ).toHaveCount(0);
});

test('the review shows only UNANSWERED pairs', async ({ page }) => {
  /**
   * A permanently visible panel trains the user to ignore the place warnings
   * appear, so an answered pair must leave no trace on this screen.
   *
   * **Asserted on this pair rather than on the panel being absent.** The
   * earlier version checked `match-review` had count 0, which only held when
   * no other test had seeded a candidate — it passed or failed on worker
   * ordering, which NOTES already records as its own defect class.
   */
  const suffix = `${Date.now()}-answered`;
  const name = `Amebix ${suffix}`;
  await seedMatchCandidate({ name, importedMbid: `mbid-${suffix}` });

  await page.goto('/manage');

  const mine = page.getByTestId('match-candidate').filter({ hasText: name });
  await expect(mine).toHaveCount(1, { timeout: 15_000 });

  await mine.getByRole('button', { name: /different artists/i }).click();

  await expect(mine, 'answered pairs leave the review').toHaveCount(0, { timeout: 15_000 });

  await page.reload();
  await expect(page.getByTestId('match-candidate').filter({ hasText: name })).toHaveCount(0);
});

test('merging names what moves and what is destroyed, then does it', async ({ page }) => {
  /**
   * §4.3. The button used to record an opinion while the data stayed split —
   * a review that clears while the records stay on two artists is worse than
   * one offering less, because the user believes it is handled.
   *
   * Merging is irreversible, so the confirmation names what MOVES and what is
   * DISCARDED, the way the delete confirmation does.
   */
  const suffix = `${Date.now()}-merge`;
  const name = `Discharge ${suffix}`;
  const { localId } = await seedMatchCandidate({
    name,
    importedMbid: `mbid-${suffix}`,
    localRecordTitle: `Hear Nothing ${suffix}`,
  });

  await page.goto('/manage');

  const row = page.getByTestId('match-candidate').filter({ hasText: name });
  await expect(row).toHaveCount(1, { timeout: 15_000 });

  // Merging is not one click — it names the consequences first.
  await row.getByRole('button', { name: /same artist/i }).click();

  const confirm = row.getByTestId('merge-confirm');
  await expect(confirm).toBeVisible();

  /**
   * **The survivor is the row with the records**, so the IMPORTED row is the
   * loser and it has nothing to move — the confirmation says so plainly rather
   * than listing an empty inventory. That is the survivor rule visible in the
   * copy: an MBID is a column and moves; a record graph is not and does not.
   */
  /**
   * **Names WHICH row survives**, in terms the user can act on. Both rows are
   * called Discharge, so "the duplicate will be deleted" is not decidable — the
   * survivor is identified by record count, the same fact the review uses.
   */
  await expect(confirm, 'the row being kept').toContainText(/keeping the artist with 1 record/i);
  await expect(confirm, 'and the one being deleted').toContainText(/the one with 0 records/i);
  await expect(confirm, 'the identity moves across').toContainText(/MusicBrainz id moves/i);
  await expect(confirm, 'and that it is permanent').toContainText(/cannot be undone/i);

  // Cancelling changes nothing.
  await confirm.getByRole('button', { name: /cancel/i }).click();
  await expect(row.getByTestId('merge-confirm')).toHaveCount(0);
  await expect(row, 'still awaiting a decision').toHaveCount(1);

  await row.getByRole('button', { name: /same artist/i }).click();
  await row.getByTestId('merge-confirm').getByRole('button', { name: /merge them/i }).click();

  await expect(row, 'the pair is gone from the review').toHaveCount(0, { timeout: 15_000 });

  // **The data actually merged**, which is the part the old button only claimed.
  const remaining = await page.request.get(`/api/artists?limit=200`);
  const body = await remaining.json();
  const named = (body.data as Array<{ id: string; name: string }>).filter((a) => a.name === name);
  expect(named, 'one artist survives, not two').toHaveLength(1);
  expect(named[0].id, 'the one holding the records').toBe(localId);
});

test('the lineup picker shows enough to choose between same-named artists', async ({ page }) => {
  /**
   * SPEC.md §4.3. Four artists are called Discharge, so the name has already
   * failed to identify them — the picker exists precisely because it did.
   *
   * What separates them is the disambiguation comment and the life-span:
   * 1977-ongoing against 1978-1980. Release counts would cost one extra request
   * per candidate at one per second, and say less.
   */
  const suffix = `${Date.now()}`;
  const name = `Discharge ${suffix}`;
  const created = await page.request.post('/api/artists', { data: { name } });
  trackArtist(((await created.json()) as { id: string }).id);

  await page.route('**/api/artists/*/lineup', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        walked: false,
        candidates: [
          {
            mbid: 'mb-dbeat',
            name,
            score: 100,
            type: 'Group',
            country: 'GB',
            disambiguation: 'UK hardcore punk/d-beat band',
            lifeSpan: { begin: '1977', end: null, ended: false },
          },
          {
            mbid: 'mb-other',
            name,
            score: 83,
            type: 'Group',
            country: 'GB',
            disambiguation: 'UK punk band, only one release',
            lifeSpan: { begin: '1978', end: '1980', ended: true },
          },
        ],
      }),
    });
  });

  // ?artists=all: this artist has no record, and the /manage default now lists
  // only what you collect. A lineup walk is run ON an imported graph node, so
  // the toggled view is where this flow actually lives.
  await openResource(page, 'Artists', '?artists=all');

  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toHaveCount(1, { timeout: 15_000 });

  await row.getByRole('button', { name: /lineup/i }).click();

  const picker = page.getByTestId('lineup-picker');
  await expect(picker).toBeVisible({ timeout: 15_000 });

  const options = picker.getByTestId('lineup-candidate');
  await expect(options).toHaveCount(2);

  // The facts that actually separate them — never the name, which is shared.
  await expect(options.first()).toContainText(/d-beat/i);
  await expect(options.first(), 'still going').toContainText('1977');
  await expect(options.nth(1)).toContainText(/only one release/i);
  await expect(options.nth(1), 'a band that ended').toContainText('1980');
});

test('a lineup walk reports what it is doing, not just that it is busy', async ({ page }) => {
  /**
   * §12 step 11: "show progress". Thirty-two seconds of spinner is
   * indistinguishable from a hang — the denominator is known before the walk
   * starts, so the screen can say "checked N of M" the whole way through.
   */
  const suffix = `${Date.now()}-progress`;
  const name = `Hot Tuna ${suffix}`;
  const created = await page.request.post('/api/artists', { data: { name } });
  trackArtist(((await created.json()) as { id: string }).id);

  let resolveWalk: (() => void) | undefined;
  const walkFinished = new Promise<void>((resolve) => {
    resolveWalk = resolve;
  });

  await page.route('**/api/artists/*/lineup', async (route) => {
    // Held open so the progress state is observable rather than a flash.
    await walkFinished;
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ walked: true, candidates: [], checked: 3, total: 3, partial: false, text: '3 members.' }),
    });
  });

  await page.route('**/api/artists/*/lineup/progress', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ found: 12 }),
    });
  });

  // ?artists=all: see the picker test above — this artist has no record, and
  // the /manage default now lists only what you collect.
  await openResource(page, 'Artists', '?artists=all');

  const row = page.getByRole('row').filter({ hasText: name });
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await row.getByRole('button', { name: /lineup/i }).click();

  const progress = page.getByTestId('lineup-progress');
  await expect(progress).toBeVisible({ timeout: 15_000 });
  await expect(progress, 'a count, not a spinner').toContainText(/12/, { timeout: 15_000 });

  resolveWalk?.();

  await expect(page.getByTestId('lineup-result')).toContainText(/3 members/i, {
    timeout: 15_000,
  });
});

test('the artist list defaults to what you collect, and says what it is hiding', async ({
  page,
}) => {
  /**
   * QA after the first live lineup walks: two imports took the artist list from
   * 6 to 71. Session players, side projects and tribute acts sat between the
   * artists Adam actually collects.
   *
   * The list mixes two populations — artists with records, which the user
   * MANAGES, and artists that exist only as graph nodes, which he will never
   * edit. The default shows the first; the count names the second, so the
   * hidden ones are not a surprise.
   */
  const suffix = `${Date.now()}`;
  const collected = `Dire Straits ${suffix}`;
  const sideman = `Alan Clark ${suffix}`;

  const artist = await page.request.post('/api/artists', { data: { name: collected } });
  trackArtist(((await artist.json()) as { id: string }).id);
  trackArtist(((await artist.json()) as { id: string }).id);
  const artistId = (await artist.json()).id;
  const created = await page.request.post('/api/artists', { data: { name: sideman } });
  trackArtist(((await created.json()) as { id: string }).id);
  await page.request.post('/api/records', {
    data: { title: `Brothers in Arms ${suffix}`, artistId },
  });

  await page.goto('/manage');
  await openResource(page, 'Artists');

  const rows = page.getByRole('row');
  await expect(rows.filter({ hasText: collected }), 'the one with a record').toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(rows.filter({ hasText: sideman }), 'the imported sideman is hidden').toHaveCount(0);

  // The hidden population is NAMED, not silently dropped.
  const summary = page.getByTestId('artist-count-summary');
  await expect(summary).toContainText(/more from lineup imports/i);

  // A LINK, not a button: the toggle lives in the URL so it survives a reload
  // and is linkable, and the page is a server component that simply queries
  // differently.
  await page.getByRole('link', { name: /show all/i }).click();

  await expect(rows.filter({ hasText: sideman }), 'and reachable on request').toHaveCount(1, {
    timeout: 15_000,
  });
});

/**
 * SPEC.md §12c (A44) — the genre hierarchy assistant.
 *
 * **The friction this exists to remove**: 32 unparented genres, assigned one
 * dropdown at a time with no view of the shape. Measured, the proposal is ~9
 * groups rather than 32 rows — so these assert that the screen GROUPS, and that
 * every decision stays the user's.
 *
 * The suggestion route is stubbed: it calls Anthropic, and CLAUDE.md §2 forbids
 * a test reaching it. What is NOT stubbed is everything the user's confirmation
 * touches — accepting really PATCHes, rejecting really writes a rejection.
 */

async function seedGenre(page: Page, name: string): Promise<string> {
  const response = await page.request.post('/api/genres', { data: { name } });
  expect(response.status(), `seeding ${name} must succeed`).toBe(201);
  return ((await response.json()) as { id: string }).id;
}

test('a suggested hierarchy is grouped, evidenced, and applied only where accepted', async ({
  page,
}) => {
  await login(page);

  const run = `${Date.now()}`;
  const rock = await seedGenre(page, `Rock-${run}`);
  const psych = await seedGenre(page, `Psychedelic Rock-${run}`);
  const aor = await seedGenre(page, `AOR-${run}`);

  await page.route('**/api/genres/parent-suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: {
          pairings: [
            { genreId: psych, genre: `Psychedelic Rock-${run}`, parentId: rock, parent: `Rock-${run}` },
            { genreId: aor, genre: `AOR-${run}`, parentId: rock, parent: `Rock-${run}` },
          ],
          noParentFits: [],
          dropped: 0,
          evidence: {
            [`Psychedelic Rock-${run}`]: { recordCount: 3, examples: ['The Doors — The Soft Parade'] },
            [`AOR-${run}`]: { recordCount: 1, examples: ['Dire Straits — Dire Straits'] },
          },
        },
      }),
    });
  });

  await page.goto('/manage');
  await openResource(page, 'Genres');
  await page.getByTestId('propose-parents').click();

  /*
    **Grouped under one heading, not listed as two independent rows.** "Is Rock
    the right bucket for these?" is one judgement, which is what makes 32
    pairings readable in a pass.
  */
  const proposal = page.getByTestId('parent-proposal');
  await expect(proposal).toBeVisible();
  await expect(proposal.getByRole('heading', { name: `Rock-${run}` })).toBeVisible();

  /*
    **The evidence STATES and never RATES.** A count is a fact the user weighs;
    a grade would be the app judging its own output — and `Rock` at ten records
    across ten unrelated artists is the standing proof that count and quality are
    different axes.
  */
  await expect(page.getByTestId(`evidence-${aor}`)).toContainText('1 record: Dire Straits');
  await expect(proposal).not.toContainText(/well supported|confiden|strong|likely/i);

  // Accept one, reject the other.
  await page.getByTestId(`accept-${psych}`).click();
  await expect(page.getByTestId(`pairing-${psych}`)).toContainText('Accepted');

  /*
    Waits for the reject's own write before asserting, rather than assuming the
    click settled. The first version raced it on `[mobile]` — a per-row decision
    is a request, and a test that treats it as instantaneous races whichever
    project is slower. Same shape as the want-list redirect race.
  */
  const rejected = page.waitForResponse(
    (r) => r.url().includes('/parent-suggestions/rejections') && r.request().method() === 'POST',
  );
  await page.getByTestId(`reject-${aor}`).click();
  await rejected;
  await expect(page.getByTestId(`pairing-${aor}`)).toContainText('will not be suggested again');

  /*
    **The load-bearing assertion: only what was ACCEPTED is written.** Rejecting
    leaves the genre exactly where it was — §8's vocabulary is the user's, and a
    rejection is a decision not to change anything.
  */
  const genres = await (await page.request.get('/api/genres?pageSize=200')).json();
  const rowOf = (id: string) =>
    (genres.data as Array<{ id: string; parentGenreId: string | null }>).find((g) => g.id === id);

  expect(rowOf(psych)?.parentGenreId, 'the accepted pairing was applied').toBe(rock);
  expect(rowOf(aor)?.parentGenreId, 'the rejected pairing changed nothing').toBeNull();
});

test('a rejected pairing is never proposed again', async ({ page }) => {
  /*
    A feature that must be dismissed repeatedly is one nobody uses twice — the
    noise argument A37's variant limit and the §9.2 dismissal decline both turn
    on. The rejection is stored, so the SERVER filters it out next time.
  */
  await login(page);

  const run = `${Date.now()}`;
  const rock = await seedGenre(page, `RejRock-${run}`);
  const aor = await seedGenre(page, `RejAOR-${run}`);

  const rejected = await page.request.post('/api/genres/parent-suggestions/rejections', {
    data: { genreId: aor, rejectedParentId: rock },
  });
  expect(rejected.status()).toBe(204);

  // Idempotent — clicking reject twice is the same fact, not an error.
  const again = await page.request.post('/api/genres/parent-suggestions/rejections', {
    data: { genreId: aor, rejectedParentId: rock },
  });
  expect(again.status(), 'rejecting twice is the same fact').toBe(204);
});

test('an empty proposal says the model found nothing, not that nothing was asked', async ({
  page,
}) => {
  /*
    **Absent versus unknown, in the UI's own vocabulary.** An empty proposal
    means the model was asked and had nothing to place; no proposal means nobody
    asked. Collapsing them would tell the user nobody looked.
  */
  await login(page);

  await page.route('**/api/genres/parent-suggestions', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        data: { pairings: [], noParentFits: [], dropped: 0, evidence: {} },
      }),
    });
  });

  await page.goto('/manage');
  await openResource(page, 'Genres');

  // Before asking: nothing at all, because nothing has been asked.
  await expect(page.getByTestId('proposal-empty')).toHaveCount(0);
  await expect(page.getByTestId('parent-proposal')).toHaveCount(0);

  await page.getByTestId('propose-parents').click();

  // After asking: an explicit result.
  await expect(page.getByTestId('proposal-empty')).toBeVisible();
});
