import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { seedMatchCandidate } from './seed';

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

async function openResource(page: Page, label: string) {
  await page.goto('/manage');
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
 * QUARANTINED — flaky, cause NOT diagnosed.
 *
 * The two genre specs below pass in isolation (6/6 clean runs, chromium only)
 * and fail under the full suite. Four attempts to fix them made the situation
 * worse rather than better, so they are skipped honestly rather than left red
 * or "fixed" by loosening assertions until they pass.
 *
 * Known: the /manage genre editor works when driven by hand; aria-busy settles
 * correctly (measured true at 200ms, false by 800ms); the rest of the E2E suite
 * is unaffected at 52 passing. Not known: what differs under the full run.
 *
 * A first hypothesis — the chromium and mobile projects racing on shared genre
 * rows — was tested by serializing Playwright and DISPROVEN: 0/4 clean either
 * way. Do not re-apply that config change without new evidence.
 *
 * Do not un-skip without a diagnosis.
 */
test('moves a genre under another with the select, on touch and pointer alike', async ({
  page,
  request,
}) => {
  const parent = unique('e2e-parent');
  const child = unique('e2e-child');

  await openResource(page, 'Genres');

  await page.getByLabel('New genre name').fill(parent);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(genreRow(page, parent)).toBeVisible({ timeout: 15_000 });

  await page.getByLabel('New genre name').fill(child);
  await page.getByRole('button', { name: 'Add' }).click();
  await expect(genreRow(page, child)).toBeVisible({ timeout: 15_000 });

  // A native select, so this is the same interaction on every device — there is
  // no drag path and therefore no untested fallback.
  await page.getByRole('combobox', { name: `Move ${child} under` }).selectOption({ label: parent });

  await expect(page.getByRole('combobox', { name: `Move ${child} under` })).toHaveValue(/.+/);

  // These rows live in the dev database, which E2E does not truncate. Removing
  // them keeps repeat runs from accumulating and keeps the move selects short.
  await cleanupGenres(request, [child, parent]);
});

/** QUARANTINED alongside the spec above — same undiagnosed flake. */
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
  await expect(confirm, 'says the duplicate row goes').toContainText(/artist row will be deleted/i);
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
