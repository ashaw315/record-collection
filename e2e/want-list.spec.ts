import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';
import { seedDiscogsCacheAs } from './seed';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../test/helpers/db';

/* Records and artists removed after each test — see e2e/cleanup.ts. */
registerCleanup();

/**
 * SPEC.md §11 E2E flow 5: "Add a want-list item, then mark it acquired, and
 * verify it appears in the collection and is flagged acquired in the want-list."
 *
 * That flow is the one that has to feel fast — it is what you do standing in a
 * shop having just bought the thing. §7.3 is what makes the second half
 * non-obvious: the want-list row is NOT deleted, it becomes history.
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

function makeSuffix(): string {
  return `w${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  return response.json();
}

/** Waits for the form to be interactive — see record-form.spec.ts. */
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

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** SPEC.md §11 flow 5, end to end. */
test('adds a want-list item, marks it acquired, and keeps it as history', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Discharge-${suffix}` });
  trackArtist(artist.id as string);
  const title = `Hear Nothing ${suffix}`;

  const item = await post(page, '/api/want-list', {
    title,
    artistId: artist.id,
    priority: 1,
    bestDigNotes: `UK first press, Porky stamp ${suffix}`,
    maxPrice: '40.00',
  });

  // It appears on the want list, with what the hunt is for.
  await page.goto('/want-list');
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  // Suffixed: a fixed string matched the parallel project's copy too, and
  // Playwright refused it in strict mode. Latent since step 6, surfaced when
  // step 7 added enough specs to make the overlap likely.
  await expect(page.getByText(`UK first press, Porky stamp ${suffix}`)).toBeVisible();

  /**
   * Scoped to THIS run's row, not `.first()`.
   *
   * Specs run fully parallel against one database, so `.first()` picks
   * whichever item another spec happened to create — NOTES' cross-spec fixture
   * rule, met here on the first run of this test.
   */
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: 'Mark acquired' })
    .click();
  await formReady(page);
  await expect(page.getByLabel('Title')).toHaveValue(title);
  await expect(page.getByLabel('Artist', { exact: true })).toHaveValue(artist.id);

  await page.getByLabel('Paid').fill('24.50');
  await page.getByRole('button', { name: 'Add to collection' }).click();

  // It lands on the new record.
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('$24.50')).toBeVisible();

  // It is in the COLLECTION.
  await page.goto(`/?artistId=${artist.id}`);
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 });

  /**
   * §7.3: the want-list row was NOT deleted. It is gone from what is still
   * wanted, and present in acquisition history — a "clean up after yourself"
   * implementation would pass the first assertion and fail the second.
   */
  await page.goto('/want-list');
  await expect(page.getByText(title)).toHaveCount(0);

  await page.goto('/want-list?acquired=true');
  await expect(page.getByText(title)).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText('Acquired').first()).toBeVisible();

  // And the history entry links to what was acquired.
  const stored = await (await page.request.get(`/api/want-list/${item.id}`)).json();
  expect(stored.isAcquired).toBe(true);
  expect(stored.acquiredRecordId).not.toBeNull();
});

/**
 * SPEC.md §5.3: "`target_pressing_id` prefills the record's pressing fields; it
 * is neither dropped nor silently copied."
 *
 * The two failure modes are opposite and both plausible, so both are tested:
 * dropping it loses the hunt (the user re-types what they already recorded),
 * and copying it invisibly asserts that the record in hand IS the pressing that
 * was wanted — which §7.7's ownership distinction depends on, and which nobody
 * checked. Visible and editable is the only correct answer.
 */
test('prefills the pressing section from the target pressing', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Target-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `CLAY-${suffix}`,
    countryPressed: 'UK',
    yearPressed: 1982,
    matrixRunout: 'A1/B1 PORKY',
    pressingPlant: 'Damont',
  });
  const title = `Prefilled ${suffix}`;

  await post(page, '/api/want-list', {
    title,
    artistId: artist.id,
    targetPressingId: pressing.id,
  });

  await page.goto('/want-list');
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: 'Mark acquired' })
    .click();
  await formReady(page);

  // VISIBLE: the hunt's details are on screen, not merely in a hidden field.
  await expect(page.getByLabel('Catalog no.')).toHaveValue(`CLAY-${suffix}`);
  await expect(page.getByLabel('Country')).toHaveValue('UK');
  await expect(page.getByLabel('Year pressed')).toHaveValue('1982');
  await expect(page.getByLabel('Matrix / runout')).toHaveValue('A1/B1 PORKY');
  await expect(page.getByLabel('Pressing plant')).toHaveValue('Damont');
});

test('the prefilled pressing is editable, and what is saved is what was edited', async ({
  page,
}) => {
  /**
   * The "not silently copied" half, and the reason §5.3 spells it out: the user
   * may have settled for a DIFFERENT pressing. §7.7 distinguishes "you own this
   * exact pressing" from "you own a different pressing of this album", and
   * CLAUDE.md §8 calls collapsing those the single worst bug this app can ship.
   *
   * So the acquired record must carry what the user CONFIRMED, not what they
   * once hoped to find.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Settled-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `WANTED-${suffix}`,
    countryPressed: 'UK',
    yearPressed: 1982,
  });
  const title = `Settled ${suffix}`;

  await post(page, '/api/want-list', { title, artistId: artist.id, targetPressingId: pressing.id });

  await page.goto('/want-list');
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: 'Mark acquired' })
    .click();
  await formReady(page);

  /**
   * The starting state has to be the TARGET, or this test cannot tell editing
   * from typing into an empty form — it passed against the unprefilled build
   * on its first run, which is NOTES' fixture rule: with no prefill, "edit" and
   * "fill in" produce identical output.
   */
  await expect(page.getByLabel('Catalog no.')).toHaveValue(`WANTED-${suffix}`);

  // What was actually in the shop: a 1985 German repress, not the UK first.
  await page.getByLabel('Catalog no.').fill(`SETTLED-${suffix}`);
  await page.getByLabel('Country').fill('DE');
  await page.getByLabel('Year pressed').fill('1985');

  await page.getByRole('button', { name: 'Add to collection' }).click();
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const recordId = page.url().split('/').pop();
  const record = await (await page.request.get(`/api/records/${recordId}`)).json();

  expect(record.pressing, 'a pressing was attached').not.toBeNull();
  expect(record.pressing.catalogNumber).toBe(`SETTLED-${suffix}`);
  expect(record.pressing.countryPressed).toBe('DE');
  expect(record.pressing.yearPressed).toBe(1985);

  // And it is a DIFFERENT pressing row from the one that was hunted for —
  // §7.7 rests on the two being distinguishable.
  expect(record.pressingId).not.toBe(pressing.id);

  // The want-list target is untouched: history records what was wanted.
  const item = await (await page.request.get(`/api/want-list?isAcquired=true`)).json();
  const acquired = item.data.find((row: { title: string }) => row.title === title);
  expect(acquired.targetPressingId).toBe(pressing.id);
});

test('accepting the prefilled pressing unchanged still attaches it', async ({ page }) => {
  /**
   * The likeliest real flow: the record in hand IS the one that was hunted, so
   * the user checks the prefilled details against the sleeve and saves without
   * touching them.
   *
   * This started as a probe while mutation-testing the "silently copied"
   * variant, and it is the case the other tests miss. Both of those EDIT a
   * field, so the form always has a changed value to act on. Accepting the
   * prefill unchanged is the path where a "leave alone means absent" rule can
   * drop the pressing entirely — the fields are visibly filled in, the save
   * succeeds, and `pressing_id` is null. Committed rather than discarded per
   * CLAUDE.md §2: the probe is what proved the branch.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Unchanged-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `KEPT-${suffix}`,
    countryPressed: 'UK',
    yearPressed: 1982,
  });
  const title = `Unchanged ${suffix}`;

  await post(page, '/api/want-list', { title, artistId: artist.id, targetPressingId: pressing.id });

  await page.goto('/want-list');
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: 'Mark acquired' })
    .click();
  await formReady(page);

  await expect(page.getByLabel('Catalog no.')).toHaveValue(`KEPT-${suffix}`);

  // Saved WITHOUT touching the pressing section.
  await page.getByRole('button', { name: 'Add to collection' }).click();
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const recordId = page.url().split('/').pop();
  const record = await (await page.request.get(`/api/records/${recordId}`)).json();

  expect(record.pressingId, 'the pressing on screen must reach the record').not.toBeNull();
  expect(record.pressing.catalogNumber).toBe(`KEPT-${suffix}`);
});

test('an item with no target pressing opens a blank pressing section', async ({ page }) => {
  // The prefill must not invent details. A want-list item recorded without a
  // target says nothing about which pressing to expect.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Untargeted-${suffix}` });
  trackArtist(artist.id as string);
  const title = `Untargeted ${suffix}`;

  await post(page, '/api/want-list', { title, artistId: artist.id });

  await page.goto('/want-list');
  await page
    .getByRole('listitem')
    .filter({ hasText: title })
    .getByRole('link', { name: 'Mark acquired' })
    .click();
  await formReady(page);

  await expect(page.getByLabel('Catalog no.')).toHaveValue('');
  await expect(page.getByLabel('Matrix / runout')).toHaveValue('');
  await expect(page.getByLabel('Year pressed')).toHaveValue('');
});

test('sorts by priority, highest first', async ({ page }) => {
  /**
   * §4.2: "1 = highest, 5 = lowest". Sorted the other way the screen is
   * useless at a glance — the thing you most want is at the bottom.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Sorted-${suffix}` });
  trackArtist(artist.id as string);

  await post(page, '/api/want-list', {
    title: `Lowest ${suffix}`,
    artistId: artist.id,
    priority: 5,
  });
  await post(page, '/api/want-list', {
    title: `Highest ${suffix}`,
    artistId: artist.id,
    priority: 1,
  });

  await page.goto('/want-list');

  const rows = page.getByRole('listitem').filter({ hasText: suffix });
  await expect(rows.first()).toContainText(`Highest ${suffix}`, { timeout: 15_000 });
  // Named rather than numbered, so the reader knows which end is the top.
  await expect(rows.first()).toContainText('Highest');
});

test('shows the target pressing and best-dig notes on the row', async ({ page }) => {
  // §10: "Each row shows target pressing and best-dig notes."
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Pressing-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `CLAY-${suffix}`,
    countryPressed: 'UK',
    yearPressed: 1982,
  });

  await post(page, '/api/want-list', {
    title: `Targeted ${suffix}`,
    artistId: artist.id,
    targetPressingId: pressing.id,
    bestDigNotes: 'Matrix A1/B1, no barcode',
    maxPrice: '40.00',
  });

  await page.goto('/want-list');

  const row = page.getByRole('listitem').filter({ hasText: `Targeted ${suffix}` });
  await expect(row).toContainText(`CLAY-${suffix}`, { timeout: 15_000 });
  await expect(row).toContainText('Matrix A1/B1, no barcode');
});

test('never describes best dig as a price or a deal', async ({ page }) => {
  /**
   * CLAUDE.md §8, asserted on the rendered page rather than only in the unit
   * test: "best dig" means the highest-fidelity pressing worth hunting for, not
   * the cheapest or the best deal. The max price is the user's own ceiling and
   * must not read as an appraisal.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Copy-${suffix}` });
  trackArtist(artist.id as string);
  await post(page, '/api/want-list', {
    title: `Copy Check ${suffix}`,
    artistId: artist.id,
    bestDigNotes: 'Original press',
    maxPrice: '30.00',
  });

  await page.goto('/want-list');
  const row = page.getByRole('listitem').filter({ hasText: `Copy Check ${suffix}` });
  await expect(row).toBeVisible({ timeout: 15_000 });

  const text = (await row.textContent()) ?? '';
  for (const forbidden of ['best deal', 'best price', 'market value', 'estimated value']) {
    expect(text.toLowerCase(), forbidden).not.toContain(forbidden);
  }
});

test('deleting an acquired item names what is lost and spares the record', async ({ page }) => {
  /**
   * §7.3: an explicit delete is permitted, but "the UI must make the
   * consequence legible before it happens — a confirmation naming what is
   * lost, not a bare delete button on an acquired row."
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Deletable-${suffix}` });
  trackArtist(artist.id as string);
  const item = await post(page, '/api/want-list', {
    title: `Deletable ${suffix}`,
    artistId: artist.id,
  });

  const acquired = await page.request.post(`/api/want-list/${item.id}/acquire`, {
    data: { title: `Deletable ${suffix}`, artistId: artist.id },
    failOnStatusCode: false,
  });
  expect(acquired.status()).toBe(201);
  const record = await acquired.json();

  await page.goto('/want-list?acquired=true');
  const row = page.getByRole('listitem').filter({ hasText: `Deletable ${suffix}` });
  await row.getByRole('button', { name: 'Delete' }).click();

  // The confirmation says what is lost AND what is not.
  const dialog = page.getByRole('dialog');
  await expect(dialog).toContainText(/acquisition history/i);
  await expect(dialog).toContainText(/not affected|stays in your collection/i);

  await page.getByTestId('confirm-delete').click();

  // The record survives: acquired_record_id points want-list to record, never
  // the reverse (§7.3).
  await expect
    .poll(async () => (await page.request.get(`/api/records/${record.id}`)).status(), {
      timeout: 15_000,
    })
    .toBe(200);
});

test('three money figures, each saying what it is', async ({ page }) => {
  /**
   * The want list is where they collide: `max_price` (the user's ceiling), the
   * market floor (what someone is asking), and Discogs' condition estimates.
   * §7.2 has kept the first two apart since step 6 — this asserts the third
   * arrives without flattening into either.
   */
  await page.route('**/api/discogs/market/**', async (route) => {
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

  /**
   * The release must be in the cache: `POST /api/pressings` VERIFIES a supplied
   * `discogsReleaseId` against Discogs (§7.7 security unit), and the E2E guard
   * refuses live calls. Cache-first verification then resolves offline.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Three-${suffix}` });
  trackArtist(artist.id as string);
  /**
   * A release id UNIQUE to this run, not the shared fixture's 381756.
   *
   * `pressings.discogs_release_id` carries a unique index (§4.2), and pressings
   * are found-or-create — so both Playwright projects running this test cannot
   * both own a pressing for 381756. The first wins and the second reads back a
   * row it did not seed. It passed alone and failed paired: the shared-row
   * collision already in NOTES, arriving through a UNIQUE constraint rather
   * than through pagination.
   *
   * The market route is stubbed above and answers for any id, so the id needs
   * only to be well-formed and this run's own. `verifyDiscogsRelease` is
   * cache-first, so the seeded payload under this id satisfies it offline.
   */
  const releaseId = 900_000_000 + Math.floor(Math.random() * 90_000_000);
  await seedDiscogsCacheAs(releaseId, 'release-detailed');

  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `CLAY-${suffix}`,
    discogsReleaseId: releaseId,
  });
  await post(page, '/api/want-list', {
    title: `Three Figures ${suffix}`,
    artistId: artist.id,
    targetPressingId: pressing.id,
    maxPrice: '35.00',
    bestDigNotes: 'The 1982 Clay press, not the 1989 repress.',
  });

  await page.goto('/want-list');
  const row = page.getByRole('listitem').filter({ hasText: `Three Figures ${suffix}` });

  // The user's ceiling, in §7.2's words.
  await expect(row).toContainText(/Most I.ll pay/i);
  await expect(row).toContainText('$35.00');

  // Not fetched until asked — this is a list (§10a).
  await expect(row.getByTestId('market-summary')).toHaveCount(0);

  await row.getByTestId('market-check').click();
  await expect(row.getByTestId('market-summary')).toContainText('11 for sale', {
    timeout: 15_000,
  });

  const text = await row.innerText();

  // Each figure says what it IS, so none can be read as another.
  expect(text, "the ceiling is the user's decision").toMatch(/Most I'll pay/i);
  expect(text, 'the floor is somebody asking').toMatch(/cheapest asking/i);
  expect(text, 'the ladder is a model').toMatch(/estimates/i);

  // And the pressing note is still a PRESSING, never a price (CLAUDE.md §8).
  expect(text).toMatch(/Best dig/i);
  expect(text).toMatch(/not the 1989 repress/i);
});

/**
 * SPEC.md §10 as amended by **A36** (2026-08-26) — inline create on the
 * want-list form.
 *
 * **The defect these cover, found by Adam using /suggestions on his own
 * collection.** "Add to want list" on a §9.2 suggestion led to a form saying
 * "No artist named Throbbing Gristle in your collection yet — add them in
 * Manage first", so acting on a suggestion meant leaving, creating the artist
 * by hand, and coming back.
 *
 * **This is the MODAL case, not an edge case.** §9.2 exists to surface records
 * by artists the collection does not have, so every genuinely good suggestion
 * hit the dead end. `/records/new` had already fixed the identical wording and
 * uses `InlineCreate`; this form never got it.
 */

/** A name no fixture or seed uses, unique per run so a leak is visible. */
const newArtistName = (run: string) => `Throbbing Gristle ${run}`;

test('a suggestion for an unknown artist reaches a saved want-list row without leaving the form', async ({
  page,
}) => {
  /*
    The whole dead end, end to end. Arrives exactly as `GapAnalysis` links —
    `?artist=` and `?title=` free text, no ids, because the model named an
    artist this collection has never heard of.
  */
  const run = Date.now().toString(36);
  const artist = newArtistName(run);
  const db = getTestDb();

  await login(page);
  await page.goto(
    `/want-list/new?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent('20 Jazz Funk Greats')}`,
  );

  // The title arrives from the suggestion; the artist matched nothing.
  await expect(page.getByLabel('Title')).toHaveValue('20 Jazz Funk Greats');
  await expect(page.getByTestId('unmatched-artist')).toBeVisible();

  /*
    The fix: the name is waiting in the inline-create box, one click from done.
    NOT created by arriving — that is the assertion in the next test.
  */
  const nameBox = page.getByLabel('New artist name');
  await expect(nameBox, 'the suggested name is waiting in the box').toHaveValue(artist);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  /*
    Selected on the form once created, so the user is not asked to find it.
    Targeted by the select's own id, because getByLabel('Artist') also matches
    InlineCreate's sr-only "New artist name" label.
  */
  await expect(page.locator('#artistId')).not.toHaveValue('');

  await page.getByRole('button', { name: /save|add to want list/i }).click();
  await expect(page).toHaveURL(/\/want-list/);
  await expect(page.getByText('20 Jazz Funk Greats')).toBeVisible();

  // Cleanup: the row this test deliberately created.
  const created = await db.execute(sql`SELECT id FROM artists WHERE name = ${artist}`);
  const artistId = (created.rows[0] as { id: string } | undefined)?.id;
  if (artistId !== undefined) {
    await db.execute(sql`DELETE FROM want_list WHERE artist_id = ${artistId}`);
    await db.execute(sql`DELETE FROM artists WHERE id = ${artistId}`);
  }
});

test('a prefill alone creates NOTHING — asserted against the database, not the form', async ({
  page,
}) => {
  /*
    **A36's actual rule, and the assertion that stops it being "improved" away.**

    §10: "No reference row is created FROM A PREFILL — a prefill is not a
    commitment, and an artist created for an abandoned form is debris nothing
    points at."

    **Asserted against `artists`, never against the UI.** A test that checked the
    inline-create box was merely closed, or that the field was empty, would PASS
    against a form that creates the artist on arrival and hides the fact — which
    is precisely the helpful-feeling shortcut A36 forbids, and precisely what
    someone would add in good faith to save a click.

    So: arrive with a name that does not exist, ABANDON the form without
    clicking create, and ask the database whether a row appeared.
  */
  const run = Date.now().toString(36);
  const artist = newArtistName(run);
  const db = getTestDb();

  const before = await db.execute(sql`SELECT count(*)::int AS n FROM artists WHERE name = ${artist}`);
  expect(
    (before.rows[0] as { n: number }).n,
    'precondition: the artist must not exist before the prefill',
  ).toBe(0);

  await login(page);
  await page.goto(`/want-list/new?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent('Heathen Earth')}`);

  /*
    Wait for the form to have RENDERED before abandoning it, so the page has
    genuinely run its server component and any creation it does would have
    happened. Keyed on the title input rather than on `unmatched-artist`:
    a form that auto-created the artist would MATCH it and drop that message,
    so waiting on it would make this test fail for the wrong reason and mask
    what the database assertion is here to say.
  */
  await expect(page.getByLabel('Title')).toHaveValue('Heathen Earth');

  // Abandon it. No create click, no save.
  await page.goto('/want-list');
  await expect(page).toHaveURL(/\/want-list$/);

  const after = await db.execute(sql`SELECT count(*)::int AS n FROM artists WHERE name = ${artist}`);
  expect(
    (after.rows[0] as { n: number }).n,
    `A36: arriving at the form with ?artist=${artist} must not create an artists row`,
  ).toBe(0);
});

/**
 * SPEC.md §9.2 — the model's reason survives the hop to the want-list form.
 *
 * **Finding 3, from Adam's real use:** he read why a record was suggested, then
 * arrived at a blank form with nothing explaining why he was there.
 *
 * **Seeded into the store directly rather than stubbed**, and that is
 * deliberate: the page reads A39's store SERVER-SIDE, so `page.route` is not in
 * the request path — stubbing would test nothing, which is the hollow-test
 * mistake this file's A39 spec already made once.
 */
const AJA = {
  artist: 'Steely Dan',
  title: 'Aja',
  reason: 'Gaucho is on your shelf, and this is the record it was chasing.',
  genre: 'Jazz Rock',
};

test('the model\'s reason arrives with the suggestion, and is absent when superseded', async ({
  page,
}) => {
  /*
    **One test, two phases, deliberately.** `gap_analysis_results` holds ONE row
    by design (A39: the screen shows the last answer, a superseded one is
    debris), so two specs seeding it would contend under `fullyParallel` — and
    they did: split across two tests they passed serially and failed together,
    the second seeing the first's row.

    That is the FEATURE's single-row property meeting the harness, not a defect
    in either. The honest fix is not `--workers=1` on a suite that is parallel by
    design; it is to stop two tests sharing one global row.
  */
  const db = getTestDb();

  // --- phase 1: the reason is there, attributed ---
  await db.execute(sql`DELETE FROM gap_analysis_results`);
  await db.execute(
    sql`INSERT INTO gap_analysis_results (suggestions, dropped)
        VALUES (${JSON.stringify([AJA])}::jsonb, 0)`,
  );

  await login(page);
  const url = `/want-list/new?artist=${encodeURIComponent(AJA.artist)}&title=${encodeURIComponent(AJA.title)}`;
  await page.goto(url);

  const reason = page.getByTestId('model-reason');
  await expect(reason).toBeVisible();
  await expect(reason).toContainText('Gaucho is on your shelf');

  /*
    **Attributed, and separable.** §9.1's reasons render on this same page from a
    computation over the user's own data; this is a model's assertion. Reading
    one as the other is the failure the rule entry in NOTES names, so the
    attribution is asserted rather than assumed.
  */
  await expect(reason).toContainText('Why Claude suggested this');
  await expect(reason).toContainText('not a fact this app checked');

  // --- phase 2: superseded, so nothing at all ---
  /*
    A39 keeps ONE analysis, so a reason exists for suggestions from the current
    one and never for older ones — a consequence of a decision made in another
    unit, not a bug here.
  */
  await db.execute(sql`DELETE FROM gap_analysis_results`);
  await db.execute(
    sql`INSERT INTO gap_analysis_results (suggestions, dropped)
        VALUES (${JSON.stringify([{ artist: 'Can', title: 'Tago Mago', reason: 'r', genre: 'Krautrock' }])}::jsonb, 0)`,
  );

  await page.goto(url);

  // The form is fully usable; only the reason is absent.
  await expect(page.getByLabel('Title')).toHaveValue('Aja');
  await expect(page.getByTestId('model-reason')).toHaveCount(0);

  /*
    **And it says nothing ABOUT the absence** — a "no reason available" line
    would draw attention to a gap the reader would not otherwise notice and
    could not act on.
  */
  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/no reason|unavailable|could not find|not available/i);

  await db.execute(sql`DELETE FROM gap_analysis_results`);
});

/**
 * SPEC.md §10 — the want-list detail view.
 *
 * **Adam's report: "I filled them in and cannot see them."** `target_pressing`
 * and `best_dig_notes` live on the row and were reachable only by editing.
 */
test('the dig fields Adam recorded are visible without editing', async ({ page }) => {
  await login(page);

  // Created through the API so the test exercises the VIEW rather than the form.
  const artist = await post(page, '/api/artists', { name: `Dig-${Date.now()}` });
  trackArtist(artist.id as string);
  const item = await post(page, '/api/want-list', {
    title: 'Rumours',
    artistId: artist.id,
    priority: 2,
    bestDigNotes: '1st US press, Porky stamp; avoid the 1979 repress',
    maxPrice: '40.00',
  });

  await page.goto('/want-list');
  await page.getByTestId('want-list-detail-link').first().click();
  await expect(page).toHaveURL(new RegExp(`/want-list/${item.id}$`));

  // The whole point: recorded once, visible without editing.
  const hunt = page.getByTestId('hunt');
  await expect(hunt).toBeVisible();
  await expect(hunt).toContainText('Porky stamp');

  /*
    **§7.2 / CLAUDE.md §8: the ceiling is a SEPARATE section.** "Best dig" is the
    pressing worth hunting for; `max_price` is an unrelated limit. Sharing a
    heading would read as one judgement about value, which is the conflation §8
    forbids — so this asserts the price is NOT inside the hunt.
  */
  await expect(hunt).not.toContainText('40');

  /*
    **Asserted as a SECTION WITH ITS OWN HEADING, not merely as a separate
    element.** §7.2 says "never one section, never one label" — and a first
    version of this checked only that the price was outside the hunt's testid,
    which a mutation passed by moving the ceiling into a bare <p> beside it.
    Not nested is not the same as separate.
  */
  const ceiling = page.getByTestId('ceiling');
  await expect(ceiling).toContainText('40');
  await expect(
    ceiling.getByRole('heading'),
    'the ceiling carries its own label, so it cannot read as part of the hunt',
  ).toBeVisible();
});

test('a row with nothing recorded shows no hunt section, not placeholders', async ({ page }) => {
  /*
    **The common case today, and the decision the unit turned on.** The screen
    shows what the user RECORDED about the hunt, so a row with nothing recorded
    is a legitimate state rather than a gap to be filled — "no target pressing
    recorded" on every field would treat blank as a defect and imply work to do.
  */
  await login(page);

  const artist = await post(page, '/api/artists', { name: `Bare-${Date.now()}` });
  trackArtist(artist.id as string);
  const item = await post(page, '/api/want-list', {
    title: 'Nothing Recorded',
    artistId: artist.id,
    priority: 3,
  });

  await page.goto(`/want-list/${item.id}`);

  // The page renders and identifies the record — it is not broken.
  await expect(page.getByRole('heading', { name: 'Nothing Recorded' })).toBeVisible();

  // And says nothing about what is absent.
  await expect(page.getByTestId('hunt')).toHaveCount(0);
  await expect(page.getByTestId('ceiling')).toHaveCount(0);

  const body = await page.locator('main').innerText();
  expect(body).not.toMatch(/not recorded|none recorded|no target|unknown|n\/a/i);
});

/**
 * SPEC.md §10 — `/want-list/:id/edit`, **specified in step 6 and never built.**
 *
 * **The defect Adam found by clicking, and it is larger than the 404.** The
 * route was promised in §10's table, half-delivered with `/want-list/new`, and
 * `WantListRow` carried no edit affordance either — so **a want-list row has
 * never been editable after creation.** That is why zero rows in the live
 * database carry `best_dig_notes`, `target_pressing_id` or `max_price`: the
 * create form offers those fields, and once past it they were unreachable.
 *
 * **These tests FOLLOW the link rather than asserting it renders.** A
 * render-only assertion cannot see a dead link — in the DOM an `<a href>` to a
 * 404 is indistinguishable from one to a real page, because the href is a string
 * either way. That is why `every-page-has-nav` caught the new screen in the same
 * unit and missed this: it counts `page.tsx` files and asserts each renders.
 */
test('a want-list row is editable, and the dig fields survive the round trip', async ({ page }) => {
  await login(page);

  const artist = await post(page, '/api/artists', { name: `Edit-${Date.now()}` });
  trackArtist(artist.id as string);
  const item = await post(page, '/api/want-list', {
    title: 'Hounds of Love',
    artistId: artist.id,
    priority: 2,
  });

  // Nothing recorded yet, so the detail view shows no hunt — the state every
  // real row is in today.
  await page.goto(`/want-list/${item.id}`);
  await expect(page.getByTestId('hunt')).toHaveCount(0);

  /*
    **Reached by CLICKING, not by navigating to a known URL.** Following the
    app's own link is what proves the route exists; `page.goto` to a path the
    test author chose would pass even if nothing rendered that link.
  */
  await page.getByTestId('want-list-edit').click();
  await expect(page).toHaveURL(new RegExp(`/want-list/${item.id}/edit$`));

  // The form arrives carrying what is already recorded.
  await expect(page.getByLabel('Title')).toHaveValue('Hounds of Love');

  await page.getByLabel(/best dig/i).fill('1st UK press on EMI, avoid the 2018 remaster');

  const patched = page.waitForResponse(
    (r) => r.url().includes(`/api/want-list/${item.id}`) && r.request().method() === 'PATCH',
  );
  await page.getByRole('button', { name: 'Save changes' }).click();
  const response = await patched;
  expect(response.status(), 'the PATCH must succeed for the round trip to mean anything').toBe(200);

  /*
    **The assertion the whole finding turns on:** a dig field entered by a USER
    through the FORM, visible on the detail view. Every previous assertion about
    these fields created them through the API, which proves the render path and
    proves nothing about whether a person can get data in.
  */
  /*
    **Wait for the form's own redirect to LAND before navigating.** The first
    version raced it: `router.push('/want-list')` was still in flight when
    `page.goto` fired, and Playwright reported "navigation interrupted by
    another navigation" — on `[mobile]` only, where the timing differs.

    Asserting the destination rather than sleeping, so the wait is on the thing
    that must happen rather than on a duration.
  */
  await expect(page).toHaveURL(/\/want-list$/);

  await page.goto(`/want-list/${item.id}`);
  await expect(page.getByTestId('hunt')).toContainText('avoid the 2018 remaster');
});

test('the want-list ROW offers editing, not only the detail view', async ({ page }) => {
  /*
    Adam: "a route reachable only from a detail page I built yesterday is half
    the fix." The list is where a user manages the hunt, so the affordance
    belongs there too.
  */
  await login(page);

  const artist = await post(page, '/api/artists', { name: `RowEdit-${Date.now()}` });
  trackArtist(artist.id as string);
  const item = await post(page, '/api/want-list', {
    title: 'The Dreaming',
    artistId: artist.id,
    priority: 4,
  });

  await page.goto('/want-list');
  await page.getByTestId(`want-list-row-edit-${item.id}`).click();

  await expect(page).toHaveURL(new RegExp(`/want-list/${item.id}/edit$`));
  await expect(page.getByLabel('Title')).toHaveValue('The Dreaming');
});

/**
 * SPEC.md §12b (A43) — the four states, told apart at a glance.
 *
 * **Adam's constraint is habituation:** *"if they render as two similar grey
 * paragraphs I will stop distinguishing them within a week."* So these assert
 * the STRUCTURE that carries the difference, not the sentences — wording is the
 * part a reader stops parsing once a screen is familiar.
 *
 * The route is stubbed: it calls Anthropic, and §2 forbids a test reaching it.
 */
async function stubAssessment(page: Page, data: Record<string, unknown>) {
  await page.route('**/api/want-list/*/pressing-assessment', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ data: { askedAt: new Date().toISOString(), dropped: 0, ...data } }),
    });
  });
}

async function seedWanted(page: Page, title: string): Promise<string> {
  const artist = await post(page, '/api/artists', { name: `Assess-${Date.now()}` });
  trackArtist(artist.id as string);
  const item = await post(page, '/api/want-list', {
    title,
    artistId: artist.id,
    priority: 3,
  });
  return item.id as string;
}

test('a pressing that matters names something checkable against the record', async ({ page }) => {
  await login(page);
  const id = await seedWanted(page, 'Rumours');

  await stubAssessment(page, {
    verdict: 'matters',
    pressings: [{ description: 'First US press', identifier: 'Warner BSK 3010, LW in the deadwax' }],
  });

  await page.goto(`/want-list/${id}`);

  // Never automatic: nothing is asked until the user asks (§10a).
  await expect(page.getByTestId('verdict-matters')).toHaveCount(0);

  await page.getByTestId('ask-pressing').click();
  await expect(page.getByTestId('verdict-matters')).toBeVisible();
  await expect(page.getByTestId('pressings-to-hunt')).toContainText('BSK 3010');

  // And it reads as the model's, never as something the app established.
  await expect(page.getByTestId('pressing-assessment')).toContainText('not a fact this app checked');
});

test('"any copy is fine" and "not known" do not look alike', async ({ page }) => {
  /*
    **The pair Adam named.** Both leave him without a pressing to hunt and they
    mean opposite things: one ENDS the hunt, the other says he is on his own.
    Asserted as different rendered elements with different markers, because
    identical-looking states are the failure he predicted within a week.
  */
  await login(page);

  const settled = await seedWanted(page, 'Any Copy Album');
  await stubAssessment(page, { verdict: 'any-copy', pressings: [] });
  await page.goto(`/want-list/${settled}`);
  await page.getByTestId('ask-pressing').click();

  const anyCopy = page.getByTestId('verdict-any-copy');
  await expect(anyCopy).toBeVisible();
  await expect(anyCopy).toContainText('Any copy is fine');
  const anyCopyMarker = (await anyCopy.innerText()).trim()[0];

  // A result, not a failure — it saves time rather than reporting an absence.
  await expect(anyCopy).not.toContainText(/could not|unable|nothing found/i);

  const open = await seedWanted(page, 'Obscure Album');
  await page.unroute('**/api/want-list/*/pressing-assessment');
  await stubAssessment(page, { verdict: 'unknown', pressings: [] });
  await page.goto(`/want-list/${open}`);
  await page.getByTestId('ask-pressing').click();

  const unknown = page.getByTestId('verdict-unknown');
  await expect(unknown).toBeVisible();
  const unknownMarker = (await unknown.innerText()).trim()[0];

  /*
    **The load-bearing assertion**: different glyphs, so the states are separable
    before a word is read.
  */
  expect(unknownMarker, 'the two non-actionable states must not share a marker').not.toBe(
    anyCopyMarker,
  );

  /*
    And "not known" says WHOSE gap it is — the model's, not the record's. "There
    is nothing to find" is a negative the app never established, and 14c draws
    the same distinction with "Discogs holds no matrix".
  */
  await expect(unknown).toContainText(/not known to claude/i);
  await expect(unknown).not.toContainText(/there is nothing|does not exist/i);
});

test('a stored assessment renders on load without spending a request', async ({ page }) => {
  /*
    **A43's storage argument, stronger than A39's.** A gap analysis is a claim
    about a collection that CHANGES; a pressing assessment is a claim about an
    album's pressing history, which does not. So there is no reason to ask twice,
    and each album costs one of ten hourly requests exactly once.

    **Seeded through the DATABASE, not through the route.** Two earlier versions
    of this test were hollow: the first let the real route run and the
    no-live-call guard refused it, the second stubbed the route so the write
    never landed. Both left nothing stored, which made "reloading spends nothing"
    trivially true — the same shape as the A39 E2E that asserted persistence
    while preventing it. **The precondition has to actually happen.**
  */
  await login(page);
  const id = await seedWanted(page, 'Aja');

  const db = getTestDb();
  await db.execute(sql`
    INSERT INTO pressing_assessments (want_list_id, verdict, pressings, dropped)
    VALUES (
      ${id},
      'matters',
      ${JSON.stringify([{ description: 'First US press', identifier: 'ABC AB-1006' }])}::jsonb,
      0
    )
  `);

  let calls = 0;
  await page.route('**/api/want-list/*/pressing-assessment**', async (route) => {
    calls += 1;
    await route.continue();
  });

  await page.goto(`/want-list/${id}`);

  /*
    **The assertion the feature exists for**: the stored answer is on the page
    at load — read server-side — and the ask button is gone, because there is
    nothing to ask.
  */
  await expect(page.getByTestId('verdict-matters')).toBeVisible();
  await expect(page.getByTestId('pressings-to-hunt')).toContainText('AB-1006');
  await expect(page.getByTestId('ask-pressing')).toHaveCount(0);

  await page.waitForLoadState('networkidle');
  expect(calls, 'viewing a stored assessment must spend nothing').toBe(0);

  // And removing it is available — delete, never edit (§7.8).
  await expect(page.getByTestId('clear-pressing')).toBeVisible();

  await db.execute(sql`DELETE FROM pressing_assessments WHERE want_list_id = ${id}`);
});
