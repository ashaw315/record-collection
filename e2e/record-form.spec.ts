import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist, trackCreated } from './cleanup';
import { login } from './sign-in';
import { HIT_FLOOR, HIT_PAST, POINTERS, pointerIs, reachingPastItself, readReach, underFloor } from './hit-area';

/* Records and artists removed after each test — see e2e/cleanup.ts. */
registerCleanup();

/**
 * SPEC.md §11 E2E flow 2: "Add a record manually, end to end, and see it in the
 * collection list" — plus the edit round trip, which is where §5.2's
 * absent-vs-null-vs-value semantics are actually exercised through a UI.
 *
 * Every fixture is scoped to its own run and its own artist. Specs run fully
 * parallel against one database, so a test that assumes what is on an
 * unfiltered page 1 assumes something no other spec is obliged to preserve
 * (NOTES.md, cross-spec fixture rule).
 */

function makeSuffix(): string {
  return `f${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;
}

async function post(page: Page, path: string, data: unknown) {
  const response = await page.request.post(path, { data, failOnStatusCode: false });
  expect(response.status(), `${path} ${JSON.stringify(data)}`).toBe(201);
  const body = await response.json();
  trackCreated(path, body);
  return body;
}

/**
 * Waits for the form to be INTERACTIVE, not merely present.
 *
 * WebKit reaches the DOM faster than React hydrates, so `fill()` can set an
 * input's value before any onChange handler is attached: the DOM holds the
 * text, React's state does not, and the submitted body omits the field
 * entirely. Measured on the mobile project — 6 of 8 submissions lost the title
 * without this wait, 0 of 8 with it. Chromium hydrates faster and almost never
 * loses the race, which is why this file passed there and failed here.
 *
 * A real user cannot type faster than hydration, so this is a test-harness
 * concern rather than a product defect.
 *
 * The signal is `data-hydrated`, which RecordForm sets from an effect. An
 * earlier version waited for a rendered CONTROL and did not fix it: the
 * controls are server-rendered, so their presence proves the markup arrived
 * rather than that it is interactive — which is exactly the failing state.
 */
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

/** SPEC.md §11 flow 2. */
test('adds a record manually and finds it in the collection', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Discharge-${suffix}` });
  trackArtist(artist.id as string);
  const label = await post(page, '/api/labels', { name: `Clay-${suffix}` });
  await post(page, '/api/genres', { name: `UK82-${suffix}` });
  const title = `Hear Nothing ${suffix}`;

  await page.goto('/records/new');
  await formReady(page);

  await page.getByLabel('Title').fill(title);
  await page.getByLabel('Artist').selectOption(artist.id);
  await page.getByLabel('Label').selectOption(label.id);
  await page.getByLabel('Release year').fill('1982');
  await page.getByLabel('Media condition').selectOption('VG+');
  await page.getByLabel('Paid').fill('24.50');

  await page.getByText(`UK82-${suffix}`).click();

  await page.getByRole('button', { name: 'Add record' }).click();

  // Lands on the new record's detail screen.
  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
  await expect(page.getByText('$24.50')).toBeVisible();

  // And it is in the collection — the "see it in the list" half of flow 2.
  await page.goto(`/?artistId=${artist.id}`);
  await expect(page.getByRole('link', { name: title })).toBeVisible({ timeout: 15_000 });
});

test('reports a validation failure without losing what was typed', async ({ page }) => {
  /**
   * A form that clears itself on a rejected save is worse than one that does
   * not save at all — the user loses the typing AND the reason.
   */
  const suffix = makeSuffix();
  const title = `No Artist ${suffix}`;

  await page.goto('/records/new');
  await formReady(page);
  await page.getByLabel('Title').fill(title);
  // No artist chosen: artistId is required by §5.2.
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page.getByRole('alert').first()).toBeVisible({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/records\/new/);
  await expect(page.getByLabel('Title')).toHaveValue(title);
});

test('edits one field without disturbing the others', async ({ page }) => {
  /**
   * The absent-vs-value half of §5.2: fields the user did not touch must not be
   * sent, so they keep their stored values. A form that submits everything
   * would still pass this — but the clearing test below is what it fails.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Edit-${suffix}` });
  trackArtist(artist.id as string);
  const label = await post(page, '/api/labels', { name: `EditLabel-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Before ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
    releaseYear: 1982,
    conditionMedia: 'VG+',
    purchasePrice: '24.50',
    notes: 'Original note.',
  });

  await page.goto(`/records/${record.id}/edit`);
  await formReady(page);
  await page.getByLabel('Title').fill(`After ${suffix}`);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: `After ${suffix}` })).toBeVisible();

  // Everything untouched survived.
  await expect(page.getByText(`EditLabel-${suffix}`)).toBeVisible();
  await expect(page.getByText('$24.50')).toBeVisible();
  await expect(page.getByText('Original note.')).toBeVisible();
  await expect(page.getByText('VG+')).toBeVisible();
});

test('clearing a field removes it rather than leaving it set', async ({ page }) => {
  /**
   * THE DISTINCTION, end to end. Emptying a select must send an explicit null
   * — not omit the field, which would leave the old value in place and make the
   * clear silently fail.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Clear-${suffix}` });
  trackArtist(artist.id as string);
  const label = await post(page, '/api/labels', { name: `ClearLabel-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Clearable ${suffix}`,
    artistId: artist.id,
    labelId: label.id,
    purchasePrice: '9.99',
  });

  await page.goto(`/records/${record.id}/edit`);
  await formReady(page);
  await expect(page.getByLabel('Label')).toHaveValue(label.id);

  await page.getByLabel('Label').selectOption('');
  await page.getByLabel('Paid').fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByText(`ClearLabel-${suffix}`)).toHaveCount(0);

  /**
   * **The cleared price now reads as a DRAWN EMPTY CELL, not the words "Not
   * recorded" (7a §1.1).** The grid marks an empty module with a diagonal: one
   * line means not recorded and the owner can fill it. So the assertion moves
   * to the mark rather than being dropped — this test's subject is that
   * clearing a field actually clears it, and the diagonal is now how the screen
   * says so.
   *
   * Located by `data-cell` rather than by text, because text is not a handle:
   * asserting on the words broke the moment the page said them in two places.
   */
  /*
    The attribute is on the MARK inside the cell rather than on the cell: 8a
    draws the diagonal as an element, so the cell holds it rather than being it.
  */
  await expect(
    page.getByTestId('record-page-8a').locator('[data-cell="provenance"] [data-diagonal]'),
  ).toHaveAttribute('data-diagonal', 'single');
});

test('removing every genre clears them, rather than leaving them alone', async ({ page }) => {
  /**
   * The nested-array half: `[]` means REMOVE ALL and absent means LEAVE ALONE.
   * NOTES records this exact distinction as having caused silent data loss
   * once, via a `.default([])` in a schema.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Genres-${suffix}` });
  trackArtist(artist.id as string);
  const genre = await post(page, '/api/genres', { name: `Removable-${suffix}` });
  const record = await post(page, '/api/records', {
    title: `Genred ${suffix}`,
    artistId: artist.id,
    genreIds: [genre.id],
  });

  await page.goto(`/records/${record.id}`);
  await expect(page.getByRole('link', { name: `Removable-${suffix}` })).toBeVisible();

  await page.goto(`/records/${record.id}/edit`);
  await formReady(page);
  // Clicking the selected chip deselects it.
  await page.getByText(`Removable-${suffix}`).click();
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByRole('link', { name: `Removable-${suffix}` })).toHaveCount(0);
});

test('saving an unchanged record returns without an error', async ({ page }) => {
  // buildPatchBody yields {} and the API rejects an empty body, so the form
  // navigates instead of sending a request it knows will fail.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Unchanged-${suffix}` });
  trackArtist(artist.id as string);
  const record = await post(page, '/api/records', {
    title: `Untouched ${suffix}`,
    artistId: artist.id,
  });

  await page.goto(`/records/${record.id}/edit`);
  await formReady(page);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: `Untouched ${suffix}` })).toBeVisible();

  /**
   * Scoped to the FORM's error, not any alert.
   *
   * `getByRole('alert')` also matches Next's route announcer, which exists
   * transiently during navigation — so the bare assertion failed while the app
   * was behaving correctly. Verified by reading the DOM once settled: zero
   * alerts. The auth spec documents the same trap.
   */
  await expect(page.getByText('Could not reach the server. Nothing was saved.')).toHaveCount(0);
  await expect(page.locator('[role="alert"].text-destructive')).toHaveCount(0);
});

/**
 * SPEC.md §10's inline create, and §5.4's `existingId` doing the job it was
 * added for.
 */
test('creates an artist inline and uses it without leaving the form', async ({ page }) => {
  const suffix = makeSuffix();
  const artistName = `Inline Artist ${suffix}`;
  const title = `Inline Record ${suffix}`;

  await page.goto('/records/new');
  await formReady(page);

  // The title is typed FIRST, so the test proves the half-filled form survives
  // the inline create — the whole reason it exists rather than a link to
  // /manage.
  await page.getByLabel('Title').fill(title);

  await page.getByRole('button', { name: '+ New artist' }).click();
  await page.getByLabel('New artist name').fill(artistName);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // exact: the inline field is labelled "New artist name", which a substring
  // match also resolves to.
  await expect(page.getByLabel('Artist', { exact: true })).not.toHaveValue('', {
    timeout: 15_000,
  });
  await expect(page.getByLabel('Title')).toHaveValue(title);

  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByRole('link', { name: artistName })).toBeVisible();
});

test('a colliding inline create selects the existing row rather than failing', async ({ page }) => {
  /**
   * THE CASE §5.4's existingId exists for. A bare "already exists" would leave
   * the user stuck with a name they cannot use and no indication of which
   * existing entry it clashed with.
   */
  const suffix = makeSuffix();
  const name = `Existing Label ${suffix}`;
  const existing = await post(page, '/api/labels', { name });

  await page.goto('/records/new');
  await formReady(page);
  await page.getByRole('button', { name: '+ New label' }).click();
  await page.getByLabel('New label name').fill(name);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // Selected, and said so — not an error.
  await expect(page.getByRole('status')).toContainText('already exists', { timeout: 15_000 });
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue(existing.id);
});

test('a collision that only cleanName can see still selects the existing row', async ({ page }) => {
  /**
   * The reason `existingId` is required rather than the client matching names
   * itself. The typed name differs from the stored one by a double space, so
   * any client-side comparison finds nothing — but `cleanName` collapses it
   * server-side and the row is the same.
   *
   * This is the case a form-side lookup would have failed silently.
   */
  const suffix = makeSuffix();
  const stored = `Spaced Label ${suffix}`;
  const typed = `Spaced  Label ${suffix}`;
  const existing = await post(page, '/api/labels', { name: stored });

  expect(typed).not.toBe(stored);

  await page.goto('/records/new');
  await formReady(page);
  await page.getByRole('button', { name: '+ New label' }).click();
  await page.getByLabel('New label name').fill(typed);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  await expect(page.getByRole('status')).toContainText('already exists', { timeout: 15_000 });
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue(existing.id);
});

test('a zero-width character cannot enter through the form', async ({ page }) => {
  /**
   * `cleanName` applies to anything created inline (§4). Asserted from the FORM
   * side because it is a new entry point: a name carrying an invisible
   * character must not become a second row that looks identical to the first.
   */
  const suffix = makeSuffix();
  const clean = `Zero Width ${suffix}`;
  const sneaky = `Zero​ Width ${suffix}`;
  const existing = await post(page, '/api/labels', { name: clean });

  expect(sneaky).not.toBe(clean);

  await page.goto('/records/new');
  await formReady(page);
  await page.getByRole('button', { name: '+ New label' }).click();
  await page.getByLabel('New label name').fill(sneaky);
  await page.getByRole('button', { name: 'Add', exact: true }).click();

  // The same row, not a twin.
  await expect(page.getByLabel('Label', { exact: true })).toHaveValue(existing.id, { timeout: 15_000 });

  const labels = await (await page.request.get('/api/labels?pageSize=200')).json();
  const matching = labels.data.filter((row: { name: string }) => row.name.includes(suffix));
  expect(matching).toHaveLength(1);
});

/**
 * SPEC.md §10's inline pressing entry — the section that makes
 * `records.pressing_id` reachable at all. Before this it was settable only
 * through the API, so matrix/runout, the field CLAUDE.md §8 calls the one that
 * identifies what you are holding, could not be entered.
 */
test('a matrix runout alone creates a pressing and attaches it', async ({ page }) => {
  /**
   * §10's identifying set is all EIGHT fields, wider than §4's match key of
   * discogs id or (catalog, country, year). A rule keyed on the match key would
   * discard this entry silently — losing the dead-wax fingerprint, which is the
   * worst outcome available.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Matrix-${suffix}` });
  trackArtist(artist.id as string);
  const matrix = `CLAYLP3-A1-${suffix}`;

  await page.goto('/records/new');
  await formReady(page);
  await page.getByLabel('Title').fill(`Matrix Only ${suffix}`);
  await page.getByLabel('Artist', { exact: true }).selectOption(artist.id);
  await page.getByLabel('Matrix / runout').fill(matrix);
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByText(matrix)).toBeVisible();
});

test('placeholders read as guidance, never as plausible entered values', async ({ page }) => {
  /**
   * A placeholder rendered as a bare `180` or `Black` is indistinguishable from
   * a value at a glance — in a screenshot, or to a tired person holding a
   * sleeve in a shop. That is the same misinformation as silently copying a
   * pressing, rendered instead of stored: the user believes the field holds
   * something it does not, and saves.
   *
   * The fix is phrasing, so the test is on the phrasing. `e.g.` is what makes a
   * sample unmistakably a sample.
   */
  await page.goto('/records/new');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });

  const sampleFields = ['purchasePrice', 'catalogNumber', 'countryPressed', 'vinylWeightGrams', 'colorVariant'];

  for (const field of sampleFields) {
    const placeholder = await page.locator(`#${field}`).getAttribute('placeholder');

    expect(placeholder, `${field} has a placeholder`).not.toBeNull();
    expect(placeholder, `${field} marks its sample as a sample`).toMatch(/^e\.g\. /);
  }

  // And the fields are genuinely EMPTY — a placeholder must never be submitted
  // as a value, which is the failure the phrasing is protecting against.
  for (const field of sampleFields) {
    await expect(page.locator(`#${field}`)).toHaveValue('');
  }
});

test('no pressing details leaves pressing_id null', async ({ page }) => {
  // §10: "Only when all eight are blank is no pressing created and pressing_id
  // left null." A form that created an empty pressing per record would produce
  // a junk row for every quick in-store entry.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `NoPressing-${suffix}` });
  trackArtist(artist.id as string);

  await page.goto('/records/new');
  await formReady(page);
  await page.getByLabel('Title').fill(`Bare ${suffix}`);
  await page.getByLabel('Artist', { exact: true }).selectOption(artist.id);
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const id = page.url().split('/').pop();
  const record = await (await page.request.get(`/api/records/${id}`)).json();
  expect(record.pressingId).toBeNull();
  // And no Pressing section on the detail screen, rather than an empty one.
  await expect(page.getByRole('heading', { name: 'Pressing' })).toHaveCount(0);
});

test('clearing every pressing field detaches without deleting the row', async ({ page }) => {
  /**
   * §10: detach, never delete. Pressings are SHARED (§4), so deleting one could
   * silently alter another record — proven here by a second record still
   * referencing the same pressing after the first detaches.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Detach-${suffix}` });
  trackArtist(artist.id as string);
  const pressing = await post(page, '/api/pressings', {
    catalogNumber: `SHARED-${suffix}`,
    countryPressed: 'UK',
    yearPressed: 1982,
  });

  const first = await post(page, '/api/records', {
    title: `Detaches ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
  });
  const second = await post(page, '/api/records', {
    title: `Keeps It ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
  });

  await page.goto(`/records/${first.id}/edit`);
  await formReady(page);
  await expect(page.getByLabel('Catalog no.')).toHaveValue(`SHARED-${suffix}`);

  for (const label of ['Catalog no.', 'Country', 'Year pressed']) {
    await page.getByLabel(label).fill('');
  }
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${first.id}$`), { timeout: 15_000 });

  // Detached from this record...
  const detached = await (await page.request.get(`/api/records/${first.id}`)).json();
  expect(detached.pressingId).toBeNull();

  // ...but the row survives, and the OTHER record still has it.
  const untouched = await (await page.request.get(`/api/records/${second.id}`)).json();
  expect(untouched.pressingId).toBe(pressing.id);

  const stillThere = await page.request.get(`/api/pressings/${pressing.id}`);
  expect(stillThere.status()).toBe(200);
});

test('a matrix value survives an edit that does not touch it', async ({ page }) => {
  /**
   * §4 and CLAUDE.md §8: matrix_runout is USER-AUTHORITATIVE. Nothing may
   * overwrite it — not a re-import, not a re-sync, and not a later edit that
   * leaves the field alone.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Authoritative-${suffix}` });
  trackArtist(artist.id as string);
  const matrix = `HANDREAD-${suffix}`;
  const pressing = await post(page, '/api/pressings', { matrixRunout: matrix });
  const record = await post(page, '/api/records', {
    title: `Keeps Matrix ${suffix}`,
    artistId: artist.id,
    pressingId: pressing.id,
  });

  await page.goto(`/records/${record.id}/edit`);
  await formReady(page);
  await expect(page.getByLabel('Matrix / runout')).toHaveValue(matrix);

  // Change something else entirely.
  await page.getByLabel('Title').fill(`Retitled ${suffix}`);
  await page.getByRole('button', { name: 'Save changes' }).click();

  await expect(page).toHaveURL(new RegExp(`/records/${record.id}$`), { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: `Retitled ${suffix}` })).toBeVisible();
  await expect(page.getByText(matrix)).toBeVisible();
});

test('a rejected pressing field is reported against that field', async ({ page }) => {
  /**
   * QA finding: entering "199" in Year pressed produced "Could not save the
   * pressing details. Nothing was saved." — naming neither the field nor the
   * reason, so the user had to guess. §5 requires `fieldErrors` on a 400 and
   * the API was returning it; the form threw the parsed body away.
   *
   * Verified separately that the message's CLAIM was true: the pressing POST
   * fails before the record POST is issued, so nothing is written. The defect
   * was the reporting, not atomicity.
   */
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `BadYear-${suffix}` });
  trackArtist(artist.id as string);

  await page.goto('/records/new');
  await formReady(page);
  await page.getByLabel('Title').fill(`Bad Year ${suffix}`);
  await page.getByLabel('Artist', { exact: true }).selectOption(artist.id);
  await page.getByLabel('Year pressed').fill('199');
  await page.getByRole('button', { name: 'Add record' }).click();

  // Named against the field, not a bare banner.
  const fieldError = page.locator('#yearPressed-error');
  await expect(fieldError).toBeVisible({ timeout: 15_000 });
  /**
   * §5.2: the message names the field in HUMAN terms and states the range.
   * "yearPressed is out of range" told the user neither which field nor what
   * would be accepted. The upper bound is derived, never hardcoded — §4.1's
   * module-load trap applies to all three year columns.
   */
  const nextYear = new Date().getUTCFullYear() + 1;
  await expect(fieldError).toHaveText(`Year pressed must be between 1877 and ${nextYear}`);

  // And what was typed survives, so the fix is one keystroke.
  await expect(page.getByLabel('Year pressed')).toHaveValue('199');
  await expect(page.getByLabel('Title')).toHaveValue(`Bad Year ${suffix}`);
});

test('a valid pressing year saves, confirming only the reporting was wrong', async ({ page }) => {
  // The developer confirmed 1999 saves where 199 does not, so validation is
  // correct. This pins that, so a "fix" that loosened the bound would fail.
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `GoodYear-${suffix}` });
  trackArtist(artist.id as string);

  await page.goto('/records/new');
  await formReady(page);
  await page.getByLabel('Title').fill(`Good Year ${suffix}`);
  await page.getByLabel('Artist', { exact: true }).selectOption(artist.id);
  await page.getByLabel('Year pressed').fill('1999');
  await page.getByRole('button', { name: 'Add record' }).click();

  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await expect(page.getByText('1999')).toBeVisible();
});

/*
  Step 129, §T.6 and §9.3: the record form's hit areas, under each pointer.
  "Under a coarse pointer, below 640 make each field's label the field's
  width with the 7 strip inside the label's box, so one continuous target;
  from 640 make the field 44 tall"; the chips' "vertical gap is 4, so grow
  it to 18 and keep the chips at 26"; the Reissue box by overlay, nothing
  drawn differently. Under a fine pointer every control keeps its drawn
  size. Read on a record's edit form, where "Everything else" is open.

  The count is not a figure: N of N where N is 27 plus one per genre and
  tag, and the genres and tags are whatever the database holds.
*/
const FORM_FIELDS = ['title', 'artistId', 'catalogNumber', 'matrixRunout', 'labelId', 'formatId', 'releaseYear', 'conditionMedia', 'conditionSleeve', 'purchasePrice', 'purchaseDate', 'storeId', 'countryPressed', 'yearPressed', 'pressingPlant', 'vinylWeightGrams', 'colorVariant', 'isReissue', 'notes'] as const;
/** The form's controls that are not a genre's or a tag's chip: the 19 fields, four + New, the way back, Everything else, Save and Cancel. */
const FORM_CONTROLS = 27;
const LABEL_ABOVE_BELOW = 640;

for (const pointer of POINTERS) test.describe(`the record form under a ${pointer} pointer`, () => {
 test.use({ hasTouch: pointer === 'coarse' });
 for (const width of [320, 390, 768, 1280]) {
  /* Coarse fails against fields of 36 with a strip of 7 under a label a word wide, chips 4 apart, a box of 16 and links of 15 to 20. Fine fails against a build that gives a mouse any of it. */
  test(pointer === 'coarse' ? `every control on the record form is 44 tall to a finger and reaches no more than 9 past itself, at ${width}` : `under a mouse every control on the record form is its drawn size and reaches no further, at ${width}`, async ({ page }) => {
    expect(await pointerIs(page), 'the precondition: the page has the pointer this test is named for').toBe(pointer);
    const suffix = makeSuffix();
    const artist = await post(page, '/api/artists', { name: `FormReach-${suffix}` });
    trackArtist(artist.id as string);
    const genres: string[] = [];
    for (let i = 0; i < 14; i += 1) genres.push((await post(page, '/api/genres', { name: `Chip ${i} ${suffix}` })).id as string);
    const record = await post(page, '/api/records', { title: `Form Reach ${suffix}`, artistId: artist.id, genreIds: [genres[0]] });

    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/records/${record.id}/edit`);
    await formReady(page);
    await page.evaluate(() => document.fonts.ready);

    const reach = await readReach(page);
    const drawn = await page.evaluate((ids) => {
      const box = (el: Element | Range) => el.getBoundingClientRect();
      const chips = Array.from(document.querySelectorAll('main fieldset label')).filter((label) => label.querySelector('input.sr-only') !== null);
      const groups = Array.from(new Set(chips.map((chip) => chip.closest('fieldset')))).map((fieldset) => {
        const tops = Array.from(new Set(chips.filter((chip) => chip.closest('fieldset') === fieldset).map((chip) => Math.round(box(chip).top * 10) / 10))).sort((a, b) => a - b);
        return tops.slice(1).map((top, index) => Math.round((top - (tops[index] ?? 0) - 26) * 10) / 10);
      });
      const fields = ids.map((id) => {
        const field = document.getElementById(id) as HTMLElement;
        const label = document.querySelector(`label[for="${id}"]`) as HTMLElement;
        const words = document.createRange();
        words.selectNodeContents(label);
        return { id, words: box(words).top - box(label.parentElement as HTMLElement).top, height: box(field).height, width: box(field).width, labelWidth: box(label).width, strip: box(field).top - box(label).bottom, fromRow: box(field).top - box(label.parentElement as HTMLElement).top };
      });
      const reissue = (document.getElementById('isReissue') as HTMLElement).closest('label') as HTMLElement;
      return { chips: chips.length, chipHeights: Array.from(new Set(chips.map((chip) => Math.round(box(chip).height * 10) / 10))), lineGaps: Array.from(new Set(groups.flat())), lines: Math.max(...groups.map((gaps) => gaps.length + 1)), fields, pastReissue: document.elementFromPoint(Math.min(box(reissue).right + 30, innerWidth - 20), box(reissue).top + box(reissue).height / 2)?.closest('label') === reissue };
    }, [...FORM_FIELDS]);

    expect(drawn.chips, 'the precondition: there are chips to read').toBeGreaterThanOrEqual(14);
    expect(drawn.lines, 'the precondition: the chips take more than one line, so there is a gap between lines').toBeGreaterThan(1);
    expect(reach.length, `N is ${FORM_CONTROLS} plus one per genre and tag (${drawn.chips} here)`).toBe(FORM_CONTROLS + drawn.chips);

    /* Drawn the same under either pointer: a chip is 26 and the box 16; the overlay draws nothing. */
    expect.soft(drawn.chipHeights, `at ${width}: every chip is drawn 26 tall`).toEqual([26]);
    const box = reach.find((r) => r.name === 'This is a reissue');
    expect.soft(box?.height, `at ${width}: the Reissue box and its words are drawn 20 tall`).toBe(20);
    const above = width < LABEL_ABOVE_BELOW;
    for (const field of drawn.fields.filter((each) => each.id !== 'isReissue' && each.id !== 'notes')) {
      expect.soft(field.height, `at ${width}: ${field.id} is drawn ${!above && pointer === 'coarse' ? 44 : 36} tall`).toBe(!above && pointer === 'coarse' ? 44 : 36);
      /* Below 640 a field stands where it stood under either pointer: 40 below its row’s top, the row’s 12, the label’s line of 24 and the 4 beneath it. */
      if (above) expect.soft(field.fromRow, `at ${width}: ${field.id} stands 40 below its row’s top`).toBeCloseTo(40, 0);
      /* And its label's words within a pixel of 18 below it, where they stood. Measured, step 129: exactly 18 under both pointers on Chromium; on WebKit 18.2 as a word in a line and 18.7 as a block with 6 above it, half a pixel no whole padding removes. A block of 24 with its own line had let them rise 2. */
      if (above) expect.soft(Math.abs(field.words - 18), `at ${width}: ${field.id}’s label’s words stand within 1 of 18 below its row’s top (${field.words})`).toBeLessThan(1);
    }

    if (pointer === 'coarse') {
      expect.soft(underFloor(reach).map((r) => `${r.name}: ${r.tall}`), `at ${width}: controls under ${HIT_FLOOR} to a finger, of ${reach.length}`).toEqual([]);
      expect.soft(reach.filter((r) => r.left > HIT_PAST || r.right > HIT_PAST).map((r) => `${r.name}: ${r.left} left, ${r.right} right`), `at ${width}: controls a tap reaches from more than ${HIT_PAST} past them`).toEqual([]);
      expect.soft(drawn.lineGaps.filter((gap) => Math.abs(gap - 18) > 0.5), `at ${width}: the chips’ lines are 18 apart (${drawn.lineGaps.join(', ')})`).toEqual([]);
      expect.soft(drawn.pastReissue, `at ${width}: the paper past the Reissue box’s words is not its target`).toBe(false);
      /* The Reissue field is a box of 16 in the middle of its own words' label of 20: the label above it is not its width, and the 2 between them is that second label's, which goes to the box too. */
      if (above) for (const field of drawn.fields) {
        expect.soft(Math.abs(field.labelWidth - field.width), `at ${width}: ${field.id}’s label is its field’s width (${field.labelWidth} against ${field.width})`).toBeLessThanOrEqual(field.id === 'isReissue' ? Number.POSITIVE_INFINITY : 0.5);
        expect.soft(Math.abs(field.strip), `at ${width}: nothing between ${field.id}’s label and the field (${field.strip})`).toBeLessThanOrEqual(field.id === 'isReissue' ? 2.5 : 0.5);
      }
    } else {
      expect.soft(reachingPastItself(reach), `at ${width}: controls a mouse reaches from outside their drawn box`).toEqual([]);
      expect.soft(reach.filter((r) => r.tall >= HIT_FLOOR && r.height < HIT_FLOOR).map((r) => `${r.name}: ${r.tall}`), `at ${width}: controls 44 tall under a mouse that were not drawn so`).toEqual([]);
      expect.soft(drawn.lineGaps.filter((gap) => Math.abs(gap - 4) > 0.5), `at ${width}: the chips’ lines are 4 apart, as they were (${drawn.lineGaps.join(', ')})`).toEqual([]);
      for (const [name, height] of [['Save changes', 32], ['Cancel', 20], ['Everything else', 20], ['+ New artist', 16], ['+ New tag', 16]] as const) expect.soft(reach.find((r) => r.name === name)?.height, `at ${width}: ${name} is drawn ${height} tall, as it was`).toBe(height);
    }

    /*
      Design, 11 Oct: "give the Reissue checkbox a 44 overlay centred on its
      box, testing that a tap anywhere in it toggles the box." Pressed at the
      overlay's top row, its middle and its bottom row, 21 either side of the
      box's middle. Under a mouse there is no overlay: 21 below the box's
      middle is paper and a press there changes nothing, and so is 21 above
      it from 640. Below 640 the row's own label stands there, 9 above the
      box, and a press on it went to the box before any of this.
    */
    const reissue = page.locator('#isReissue');
    await reissue.scrollIntoViewIfNeeded();
    for (const dy of [-21, 0, 21]) {
      const at = await reissue.boundingBox();
      if (at === null) throw new Error('no Reissue box');
      const before = await reissue.isChecked();
      if (pointer === 'coarse') await page.touchscreen.tap(at.x + at.width / 2, at.y + at.height / 2 + dy);
      else await page.mouse.click(at.x + at.width / 2, at.y + at.height / 2 + dy);
      const toggles = pointer === 'coarse' || dy === 0 || (dy < 0 && above);
      expect.soft(await reissue.isChecked(), `at ${width}: a press ${dy} from the Reissue box’s middle ${toggles ? 'toggles it' : 'leaves it'}`).toBe(toggles ? !before : before);
    }

    /* A + New, opened: a field with no drawn label and two buttons, which are boxes and are 44 in the box under a finger. */
    await page.getByRole('button', { name: '+ New artist' }).click();
    const opened = (await readReach(page)).filter((r) => r.name === 'New artist name' || r.name === 'Add' || (r.name === 'Cancel' && r.kind === 'button'));
    expect(opened.map((r) => r.name).sort(), 'the precondition: the opened + New has its field and two buttons').toEqual(['Add', 'Cancel', 'New artist name']);
    if (pointer === 'coarse') expect.soft(opened.filter((r) => r.height < HIT_FLOOR).map((r) => `${r.name}: ${r.height}`), `at ${width}: the opened + New’s controls under ${HIT_FLOOR} in the box`).toEqual([]);
    else expect.soft(opened.map((r) => r.height), `at ${width}: the opened + New’s controls are 32 tall, as they were`).toEqual([32, 32, 32]);
  });
 }
});
