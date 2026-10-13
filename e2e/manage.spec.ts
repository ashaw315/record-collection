import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackGenre, trackGenreNamed } from './cleanup';
import { seedMatchCandidate } from './seed';
import { login } from './sign-in';
import { HIT_FLOOR, POINTERS, expectDialogControls, expectFloor } from './hit-area';

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

/** The row's own name cell, not the <option> copies inside every move select. */
function genreRow(page: Page, name: string) {
  if (narrow(page)) return entry(page, name);
  return page.getByRole('listitem').filter({ has: page.getByRole('button', { name: `Edit ${name}` }) });
}

/*
  **Driving, by width** (manage's pass, step 133). Below 640 a section is a
  list whose rows open in place; from 640 it is the table it was. Both are
  in the page and the stylesheet shows one, so every helper reads the one
  that is shown, and each test keeps its claim on either.
*/
const MANAGE_LIST = '[data-manage-list]:visible';
const MANAGE_TABLE = '[data-manage-table]:visible';
function narrow(page: Page): boolean {
  return (page.viewportSize()?.width ?? 1280) < 640;
}
/** The section as shown: fields are found inside it, because the one not shown carries the same labels. */
function shownSection(page: Page) {
  return page.locator(narrow(page) ? MANAGE_LIST : MANAGE_TABLE);
}
/** An entry's row by its whole name: "LP" is not "2xLP", and a genre's name is also in the line beneath its child's. */
function entry(page: Page, name: string) {
  if (!narrow(page)) return page.getByRole('row').filter({ hasText: name });
  const whole = new RegExp(`^\\s*${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*(Built in)?\\s*$`, 'i');
  return page.locator(`${MANAGE_LIST} [data-manage-row]`).filter({ has: page.locator('[data-manage-name]', { hasText: whole }) });
}
/** Below 640 an entry's controls are in its open form; from 640 they are on its row and there is nothing to open. */
async function openEntry(page: Page, name: string) {
  if (!narrow(page)) return;
  const opener = entry(page, name).locator('[data-manage-open]');
  if ((await opener.getAttribute('aria-expanded')) !== 'true') await opener.click();
  await expect(entry(page, name).locator('[data-manage-form]')).toBeVisible();
}
async function addEntry(page: Page, singular: string, name: string) {
  if (narrow(page)) {
    const fresh = page.locator(`${MANAGE_LIST} [data-manage-new]`);
    if ((await fresh.getAttribute('aria-expanded')) !== 'true') await fresh.click();
    await shownSection(page).getByLabel(`New ${singular} name`, { exact: true }).fill(name);
    await shownSection(page).getByRole('button', { name: `Save new ${singular}` }).click();
    return;
  }
  await shownSection(page).getByLabel(`New ${singular} name`, { exact: true }).fill(name);
  await shownSection(page).getByRole('button', { name: 'Add' }).click();
}
async function pressDelete(page: Page, name: string) {
  await openEntry(page, name);
  await shownSection(page).getByRole('button', { name: `Delete ${name}`, exact: true }).click();
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
  const name = `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
  /*
    Every genre this spec makes through the page is named by this function,
    so the name is tracked here and the shared cleanup deletes the genre by
    it when the test ends, passed or failed. A name that became a tag or a
    label instead matches no genre and deletes nothing.
  */
  trackGenreNamed(name);
  return name;
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

  await addEntry(page, 'tag', name);
  await expect(entry(page, name)).toBeVisible({ timeout: 15_000 });

  // Edit happens in place — no navigation.
  if (narrow(page)) await openEntry(page, name);
  else await page.getByRole('button', { name: `Edit ${name}`, exact: true }).click();
  const field = shownSection(page).getByLabel(`${name} name`, { exact: true });
  await field.fill(renamed);
  await field.press('Enter');
  await expect(entry(page, renamed)).toBeVisible({
    timeout: 15_000,
  });

  await pressDelete(page, renamed);
  await page.getByTestId('confirm-delete').click();
  await expect(entry(page, renamed)).toBeHidden({
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
  await pressDelete(page, tagName);
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

  await openEntry(page, 'LP');
  const del = shownSection(page).getByRole('button', { name: 'Delete LP', exact: true });
  await expect(del).toHaveAttribute('aria-disabled', 'true');

  // The row says so too, so the reason survives without hovering — which a
  // touch device cannot do.
  await expect(narrow(page) ? entry(page, 'LP') : page.getByRole('cell', { name: /LP/ }).first()).toContainText('Built in');
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
    await addEntry(page, 'genre', name);
    await expect(genreRow(page, name)).toBeVisible({ timeout: 15_000 });
  }

  await addEntry(page, 'genre', child);
  await expect(genreRow(page, child)).toBeVisible({ timeout: 15_000 });

  /**
   * The parent's id, read from the option the select offers, so the assertion
   * below can name WHICH parent rather than merely "some non-empty value".
   */
  await openEntry(page, child);
  const childSelect = shownSection(page).getByRole('combobox', { name: `Move ${child} under` });
  const parentId = await childSelect
    .getByRole('option', { name: parent, exact: true })
    .getAttribute('value');
  expect(parentId, 'the parent must be offered before it can be chosen').toBeTruthy();

  // A native select, so this is the same interaction on every device — there is
  // no drag path and therefore no untested fallback.
  await childSelect.selectOption({ label: parent });
  /* Below 640 the select is a field of the open form and the move is made on SAVE; from 640 choosing is the move. The row is then opened again, so the value read is the stored one. */
  if (narrow(page)) {
    await shownSection(page).getByRole('button', { name: `Save ${child}`, exact: true }).click();
    await expect(genreRow(page, child)).toHaveAttribute('aria-level', '2', { timeout: 15_000 });
    await openEntry(page, child);
  }

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

  await addEntry(page, 'genre', parent);
  await expect(genreRow(page, parent)).toBeVisible({ timeout: 15_000 });
  await addEntry(page, 'genre', child);

  await expect(genreRow(page, child)).toBeVisible({ timeout: 15_000 });
  await openEntry(page, child);
  await shownSection(page).getByRole('combobox', { name: `Move ${child} under` }).selectOption({ label: parent });
  if (narrow(page)) {
    await shownSection(page).getByRole('button', { name: `Save ${child}`, exact: true }).click();
    await expect(genreRow(page, child)).toHaveAttribute('aria-level', '2', { timeout: 15_000 });
  }

  // The parent's own select must not list its child: offering the move only to
  // have the API reject it is worse than not offering it.
  // The parent row must exist before its select can be read.
  await expect(genreRow(page, parent)).toBeVisible({ timeout: 15_000 });
  await openEntry(page, parent);
  const parentSelect = shownSection(page).getByRole('combobox', { name: `Move ${parent} under` });
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

  const row = entry(page, name);
  await expect(row).toHaveCount(1, { timeout: 15_000 });

  await openEntry(page, name);
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

  const row = entry(page, name);
  await expect(row).toHaveCount(1, { timeout: 15_000 });
  await openEntry(page, name);
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

  await expect(entry(page, collected), 'the one with a record').toHaveCount(1, {
    timeout: 15_000,
  });
  await expect(entry(page, sideman), 'the imported sideman is hidden').toHaveCount(0);

  // The hidden population is NAMED, not silently dropped.
  const summary = page.getByTestId('artist-count-summary');
  await expect(summary).toContainText(/more from lineup imports/i);

  // A LINK, not a button: the toggle lives in the URL so it survives a reload
  // and is linkable, and the page is a server component that simply queries
  // differently.
  await page.getByRole('link', { name: /show all/i }).click();

  await expect(entry(page, sideman), 'and reachable on request').toHaveCount(1, {
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
  const id = ((await response.json()) as { id: string }).id;
  trackGenre(id);
  return id;
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

/*
  Step 128: manage's delete opens the shared dialog. Its three controls are
  44 under a coarse pointer and as they were under a fine one. The rest of
  manage's controls wait on its phone layout.
*/
for (const pointer of POINTERS) test.describe(`manage’s delete confirmation under a ${pointer} pointer`, () => {
  test.use({ hasTouch: pointer === 'coarse' });
  for (const width of [320, 390, 768, 1280]) {
    /* Coarse fails against buttons of 32 and a cross of 28. Fine holds them there. */
    test(`Cancel, Delete and Close are ${pointer === 'coarse' ? '44 to a finger' : 'their drawn size under a mouse'}, at ${width}`, async ({ page }) => {
      const name = unique('e2e-reach');
      await page.setViewportSize({ width, height: 844 });
      await openResource(page, 'Tags');
      await addEntry(page, 'tag', name);
      await expect(entry(page, name)).toBeVisible({ timeout: 15_000 });
      await pressDelete(page, name);
      await expectDialogControls(page, pointer, `manage’s delete at ${width}`);
      /* The tag is this test's own; the confirmation removes it. */
      await page.getByTestId('confirm-delete').click();
      await expect(entry(page, name)).toBeHidden({ timeout: 15_000 });
    });
  }
});

/*
  Step 133, manage's pass (§T.6). "Below 640, each manage section is a list,
  not a table: one row per entry, its name in full on the first line and its
  other fields on a second line in the label colour, and pressing the row
  opens it in place as a form." One open at a time; + NEW at the list's
  head; genres indented 12 a level, capped at three; the section names wrap
  and are 44 a line under a coarse pointer; BUILT IN is a label; rows start
  at the 18. From 640 the tables stay inside the column. The success
  condition: no control past the window's edge.
*/
const LIST = '[data-manage-list]';
const SECTIONS = ['Artists', 'Genres', 'Labels', 'Formats', 'Stores', 'Tags'] as const;

/** One of everything, with names long enough to have been cut in the table at 320, and a genre chain five deep. */
async function seedManage(page: Page) {
  const tag = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
  const post = async (path: string, data: unknown) => {
    const response = await page.request.post(path, { data, failOnStatusCode: false });
    expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
    return ((await response.json()) as { id: string }).id;
  };
  const names = { artist: `A Band With A Name As Long As Any ${tag}`, label: `A Label With A Long Name ${tag}`, store: `A Shop With A Long Name ${tag}`, tag: `a-tag-with-a-long-name-${tag}`, genres: [0, 1, 2, 3, 4].map((depth) => `Depth ${depth} genre with a long name ${tag}`) };
  const artist = await post('/api/artists', { name: names.artist, formedYear: 1977, originCountry: 'UK' });
  trackArtist(artist);
  /* The artists' section lists what is collected: a record makes this one collected. */
  await post('/api/records', { title: `Manage Pass ${tag}`, artistId: artist });
  /* A Discogs id is unique among labels, and tests run side by side. */
  const discogsId = 800_000_000 + Math.floor(Math.random() * 90_000_000);
  const label = await post('/api/labels', { name: names.label, discogsLabelId: discogsId });
  const store = await post('/api/stores', { name: names.store, city: 'Leeds', country: 'UK', isFavorite: true });
  const tagId = await post('/api/tags', { name: names.tag });
  let parent: string | null = null;
  for (const name of names.genres) {
    trackGenreNamed(name);
    parent = await post('/api/genres', parent === null ? { name } : { name, parentGenreId: parent });
  }
  return { names, discogsId, remove: async () => { for (const path of [`/api/labels/${label}`, `/api/stores/${store}`, `/api/tags/${tagId}`]) await page.request.delete(path, { failOnStatusCode: false }); } };
}

async function section(page: Page, label: string) {
  await page.getByRole('navigation', { name: 'Resource' }).getByRole('button', { name: label, exact: true }).click();
  await expect(page.getByRole('region', { name: label })).toBeVisible();
}

for (const width of [320, 390]) {
  /* Fails against the tables: no list, names cut, and controls past the window's edge in five of the six sections. */
  test(`below 640 each manage section is a list with every name in full and no control past the window’s edge, at ${width}`, async ({ page }) => {
    const { names, discogsId, remove } = await seedManage(page);
    await page.setViewportSize({ width, height: 844 });
    await page.goto('/manage');
    const second: Record<string, [string, string]> = { Artists: [names.artist, '1977 · UK'], Labels: [names.label, String(discogsId)], Stores: [names.store, 'Leeds · UK · Favourite'], Tags: [names.tag, ''], Genres: [names.genres[1] ?? '', `Under ${names.genres[0]}`] };
    for (const label of SECTIONS) {
      await section(page, label);
      const list = page.locator(`${LIST}:visible`);
      await expect(list, `${label}: a list, not a table`).toHaveCount(1);
      await expect(page.locator('[data-manage-table]:visible'), `${label}: no table below 640`).toHaveCount(0);
      const m = await page.evaluate(() => {
        const controls = Array.from(document.querySelectorAll<HTMLElement>('[data-screen-frame] a, [data-screen-frame] button, [data-screen-frame] input, [data-screen-frame] select, [data-screen-frame] textarea')).filter((el) => el.getClientRects().length > 0 && el.checkVisibility());
        const rows = Array.from(document.querySelectorAll<HTMLElement>('[data-manage-list] [data-manage-row]')).filter((el) => el.getClientRects().length > 0);
        return { past: controls.filter((el) => el.getBoundingClientRect().right > innerWidth + 0.5).map((el) => (el.textContent ?? '').trim() || el.getAttribute('aria-label')), page: document.documentElement.scrollWidth, window: innerWidth, lefts: [...new Set(rows.map((row) => Math.round(row.getBoundingClientRect().left)))], cut: rows.filter((row) => { const name = row.querySelector('[data-manage-name]') as HTMLElement; return name.scrollWidth > name.clientWidth + 1; }).length, rows: rows.length };
      });
      expect.soft(m.past, `${label} at ${width}: controls past the window’s edge`).toEqual([]);
      expect.soft(m.page, `${label} at ${width}: the page is the window’s width`).toBe(m.window);
      expect.soft(m.rows, `${label}: the precondition, there are rows`).toBeGreaterThan(0);
      expect.soft(m.lefts, `${label} at ${width}: rows start at the 18`).toEqual([18]);
      expect.soft(m.cut, `${label} at ${width}: names cut short`).toBe(0);
      const mine = second[label];
      if (mine !== undefined) {
        /* By its name's own line: a genre's name is also in the second line of the genre beneath it. */
        const row = list.locator('[data-manage-row]').filter({ has: page.locator('[data-manage-name]', { hasText: mine[0] }) });
        await expect(row.locator('[data-manage-name]'), `${label}: the name in full`).toContainText(mine[0]);
        if (mine[1] === '') await expect(row.locator('[data-manage-second]'), `${label}: a row with no other field has no second line`).toHaveCount(0);
        else await expect(row.locator('[data-manage-second]'), `${label}: its other fields on a second line, the empty ones left out`).toHaveText(mine[1]);
      }
    }

    /* Genres: 12 a level, capped at three. */
    await section(page, 'Genres');
    const indents: number[] = [];
    for (const name of names.genres) indents.push(await page.locator(`${LIST}:visible [data-manage-name]`).filter({ hasText: name }).first().evaluate((el) => Math.round(el.getBoundingClientRect().left)));
    expect(indents.map((left) => left - (indents[0] ?? 0)), 'a genre is indented 12 a level and no further than three').toEqual([0, 12, 24, 36, 36]);

    /* Formats: BUILT IN is a label after the name, not a box. */
    await section(page, 'Formats');
    const built = page.locator(`${LIST}:visible [data-manage-row]`).filter({ hasText: 'LP' }).first().locator('[data-built-in]');
    await expect(built).toHaveText(/built in/i);
    expect(await built.evaluate((el) => getComputedStyle(el).borderTopWidth), 'BUILT IN has no box').toBe('0px');

    /* Open in place, one at a time, and + NEW at the head. */
    await section(page, 'Stores');
    const list = page.locator(`${LIST}:visible`);
    const row = list.locator('[data-manage-row]').filter({ hasText: names.store });
    await row.locator('[data-manage-open]').click();
    const form = row.locator('[data-manage-form]');
    await expect(form).toBeVisible();
    for (const field of ['name', 'city', 'country']) await expect(form.getByLabel(`${names.store} ${field}`, { exact: true })).toBeVisible();
    /* Design's drop of 12 Oct, manage's open form (2): "The form shows SAVE only once something has changed." This held SAVE visible in a form just opened; the claim changed with the ruling. */
    await expect(form.getByRole('button', { name: `Save ${names.store}` }), 'nothing changed, so no SAVE').toHaveCount(0);
    await expect(form.getByRole('button', { name: `Delete ${names.store}` })).toBeVisible();
    /* (5): "Notes, address and website join the open form, after the fields the second line shows, in that order." Fails against the declaration's order, which put State / region, Address and Website before Notes. */
    expect(await form.locator('label').evaluateAll((all) => all.map((label) => (label.textContent ?? '').trim()))).toEqual(['Name', 'City', 'Country', 'Favourite', 'Notes', 'Address', 'Website', 'State / region']);
    const widths = await form.evaluate((el) => { const field = el.querySelector('input:not([type=checkbox])') as HTMLElement; return [Math.round(field.getBoundingClientRect().width), Math.round(el.getBoundingClientRect().width)]; });
    expect(widths[0], 'a field in the open form is the form’s width').toBe(widths[1]);
    await expect(list.locator('[data-manage-new]'), '+ NEW is at the list’s head').toHaveText(/\+ new store/i);
    expect(await list.evaluate((el) => (el.firstElementChild as HTMLElement).querySelector('[data-manage-new]') !== null), 'and is the list’s first row').toBe(true);
    await list.locator('[data-manage-new]').click();
    await expect(list.getByLabel('New store name', { exact: true })).toBeVisible();
    await expect(form, 'one open at a time: opening + NEW closed the row').toHaveCount(0);
    await row.locator('[data-manage-open]').click();
    await expect(list.getByLabel('New store name', { exact: true }), 'and opening the row closed + NEW').toHaveCount(0);
    await row.locator('[data-manage-open]').click();
    await expect(row.locator('[data-manage-form]'), 'pressing the open row closes it, saving nothing').toHaveCount(0);
    await remove();
  });
}

for (const pointer of POINTERS) test.describe(`manage under a ${pointer} pointer`, () => {
  test.use({ hasTouch: pointer === 'coarse' });
  for (const width of [320, 390, 768, 1280]) {
    /* Coarse fails against section names of 32.5, new-row fields of 32, Edit and Delete of 28 and selects of 36. Fine holds what a mouse had from 640 and the list's drawn sizes below it. */
    test(pointer === 'coarse' ? `every control on manage is 44 tall and 44 across to a finger, rows and open forms, at ${width}` : `under a mouse no control on manage reaches past itself, at ${width}`, async ({ page }) => {
      const { names, remove } = await seedManage(page);
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/manage');
      const mine: Record<string, string> = { Artists: names.artist, Genres: names.genres[1] ?? '', Labels: names.label, Formats: 'LP', Stores: names.store, Tags: names.tag };
      for (const label of SECTIONS) {
        await section(page, label);
        await page.evaluate(() => document.fonts.ready);
        const rest = await expectFloor(page, pointer, `${label} at ${width}, at rest`, '[data-screen-frame]');
        if (pointer === 'coarse') expect.soft(rest.filter((r) => r.wide < HIT_FLOOR).map((r) => `${r.name.slice(0, 30)}: ${r.wide}`), `${label} at ${width}, at rest: controls under ${HIT_FLOOR} across to a finger`).toEqual([]);
        if (width >= 640) continue;
        /* The open form and + NEW's form, the list's two other states. */
        const list = page.locator(`${LIST}:visible`);
        await list.locator('[data-manage-row]').filter({ has: page.locator('[data-manage-name]', { hasText: mine[label] ?? '' }) }).first().locator('[data-manage-open]').click();
        await expect(list.locator('[data-manage-form]')).toBeVisible();
        const open = await expectFloor(page, pointer, `${label} at ${width}, a row open`, '[data-screen-frame]');
        if (pointer === 'coarse') expect.soft(open.filter((r) => r.wide < HIT_FLOOR).map((r) => `${r.name.slice(0, 30)}: ${r.wide}`), `${label} at ${width}, a row open: controls under ${HIT_FLOOR} across to a finger`).toEqual([]);
        await list.locator('[data-manage-new]').click();
        const fresh = await expectFloor(page, pointer, `${label} at ${width}, + NEW open`, '[data-screen-frame]');
        if (pointer === 'coarse') expect.soft(fresh.filter((r) => r.wide < HIT_FLOOR).map((r) => `${r.name.slice(0, 30)}: ${r.wide}`), `${label} at ${width}, + NEW open: controls under ${HIT_FLOOR} across to a finger`).toEqual([]);
      }
      /* The section names: no box, and under a coarse pointer each line of them 44. */
      const namesRow = await page.evaluate(() => Array.from(document.querySelectorAll<HTMLElement>('nav[aria-label="Resource"] button')).map((button) => ({ border: getComputedStyle(button).borderTopWidth, top: Math.round(button.getBoundingClientRect().top), height: button.getBoundingClientRect().height, right: button.getBoundingClientRect().right })));
      expect.soft(namesRow.filter((n) => n.border !== '0px').length, `at ${width}: section names with a box`).toBe(0);
      expect.soft(namesRow.filter((n) => n.right > width + 0.5).length, `at ${width}: section names past the window’s edge`).toBe(0);
      if (pointer === 'coarse') expect.soft(namesRow.filter((n) => n.height < HIT_FLOOR).length, `at ${width}: section names under 44 a line`).toBe(0);
      if (width === 320) expect.soft(new Set(namesRow.map((n) => n.top)).size, 'at 320 the six section names take two lines').toBe(2);
      await remove();
    });
  }
});

/*
  Step 137, Design's ruling of 12 Oct: "Manage confirms on close only while
  SAVE is showing. One line, with DISCARD CHANGES and KEEP EDITING. A close
  with nothing changed stays silent." Below 640, where a row is a form that
  a second press closes. Before this a close threw the changes away without
  a word (step 133's second default).
*/
const CONFIRM = '[data-manage-confirm]';
for (const pointer of POINTERS) test.describe(`manage’s open row with changes, under a ${pointer} pointer`, () => {
  test.use({ hasTouch: pointer === 'coarse' });
  for (const width of [320, 390]) {
    /* Fails against the list as built: the second press closes the form and the typed name is gone, with nothing asked. */
    test(`closing a changed row asks once, on one line, and each answer does what it says, at ${width}`, async ({ page }) => {
      const { names, remove } = await seedManage(page);
      await page.setViewportSize({ width, height: 844 });
      await page.goto('/manage');
      await section(page, 'Stores');
      const list = page.locator(`${LIST}:visible`);
      const row = list.locator('[data-manage-row]').filter({ hasText: names.store });
      const opener = row.locator('[data-manage-open]');
      const form = row.locator('[data-manage-form]');
      const city = form.getByLabel(`${names.store} city`, { exact: true });

      /* Nothing changed: silent. */
      await opener.click();
      await expect(form).toBeVisible();
      await opener.click();
      await expect(form, 'a close with nothing changed closes').toHaveCount(0);
      await expect(page.locator(CONFIRM), 'and asks nothing').toHaveCount(0);

      /* Changed and changed back: silent. */
      await opener.click();
      await city.fill('York');
      await city.fill('Leeds');
      await opener.click();
      await expect(form, 'a field put back as it was is not a change').toHaveCount(0);
      await expect(page.locator(CONFIRM)).toHaveCount(0);

      /* SAVE is there only while something has changed (the drop of 12 Oct): fails against a form that shows it from the moment it opens. */
      await opener.click();
      const save = form.getByRole('button', { name: `Save ${names.store}` });
      await expect(save, 'a form just opened has no SAVE').toHaveCount(0);
      await city.fill('York');
      await expect(save, 'a change brings it').toBeVisible();
      await city.fill('Leeds');
      await expect(save, 'and putting the field back takes it away').toHaveCount(0);

      /* Escape is a close: silent with nothing changed. Fails against a form Escape does nothing to. */
      await city.press('Escape');
      await expect(form, 'Escape closes an unchanged form').toHaveCount(0);
      await expect(page.locator(CONFIRM)).toHaveCount(0);

      /* Changed: Escape asks, as the row pressed again does, and the form stays. */
      await opener.click();
      await city.fill('York');
      await city.press('Escape');
      await expect(form.locator(CONFIRM), 'Escape over a change asks').toBeVisible();
      await form.locator(CONFIRM).getByRole('button', { name: 'Keep editing' }).click();
      await expect(city).toHaveValue('York');
      await opener.click();
      const confirm = form.locator(CONFIRM);
      await expect(confirm).toBeVisible();
      await expect(form, 'the form is still open').toBeVisible();
      expect(await confirm.locator('button').allTextContents().then((all) => all.map((text) => text.trim().toUpperCase()))).toEqual(['DISCARD CHANGES', 'KEEP EDITING']);
      expect(await confirm.locator('button').evaluateAll((all) => new Set(all.map((b) => Math.round(b.getBoundingClientRect().top))).size), 'one line').toBe(1);
      expect(await confirm.evaluate((el) => el.getBoundingClientRect().right <= innerWidth + 0.5 && document.documentElement.scrollWidth === innerWidth), 'inside the window').toBe(true);
      const reach = await expectFloor(page, pointer, `the confirmation at ${width}`, CONFIRM);
      if (pointer === 'coarse') expect(reach.filter((r) => r.wide < HIT_FLOOR).map((r) => `${r.name}: ${r.wide}`), 'each 44 across to a finger').toEqual([]);

      /* KEEP EDITING: the question goes, the form and what was typed stay. */
      await confirm.getByRole('button', { name: 'Keep editing' }).click();
      await expect(page.locator(CONFIRM)).toHaveCount(0);
      await expect(city, 'what was typed is still there').toHaveValue('York');

      /* Another row, and + NEW, are closes too: asked, and not opened until answered. */
      await list.locator('[data-manage-new]').click();
      await expect(form.locator(CONFIRM), '+ NEW over a changed row asks').toBeVisible();
      await expect(list.getByLabel('New store name', { exact: true }), 'and has not opened').toHaveCount(0);

      /* DISCARD CHANGES: what was asked for happens, and nothing was saved. */
      await form.locator(CONFIRM).getByRole('button', { name: 'Discard changes' }).click();
      await expect(form, 'the row closed').toHaveCount(0);
      await expect(list.getByLabel('New store name', { exact: true }), 'and + NEW, which was pressed, opened').toBeVisible();
      await expect(row.locator('[data-manage-second]'), 'the row is as it was').toHaveText('Leeds · UK · Favourite');

      /* + NEW with something typed is a changed form as well. */
      await expect(list.getByRole('button', { name: 'Save new store' }), '+ NEW’s form has no SAVE until something is typed').toHaveCount(0);
      await list.getByLabel('New store name', { exact: true }).fill('Half typed');
      await expect(list.getByRole('button', { name: 'Save new store' })).toBeVisible();
      await list.locator('[data-manage-new]').click();
      await expect(list.locator(CONFIRM), 'closing + NEW with a name typed asks').toBeVisible();
      await list.locator(CONFIRM).getByRole('button', { name: 'Discard changes' }).click();
      await expect(list.getByLabel('New store name', { exact: true })).toHaveCount(0);

      /* SAVE does not ask. */
      await opener.click();
      await city.fill('York');
      await form.getByRole('button', { name: `Save ${names.store}` }).click();
      await expect(page.locator(CONFIRM), 'saving is not closing with changes').toHaveCount(0);
      await expect(row.locator('[data-manage-second]')).toHaveText('York · UK · Favourite', { timeout: 15_000 });
      await remove();
    });
  }
});
