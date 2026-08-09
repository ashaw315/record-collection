import { expect, test, type Page } from '@playwright/test';

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
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

/** SPEC.md §11 flow 5, end to end. */
test('adds a want-list item, marks it acquired, and keeps it as history', async ({ page }) => {
  const suffix = makeSuffix();
  const artist = await post(page, '/api/artists', { name: `Discharge-${suffix}` });
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
  await expect(page.getByText('£24.50')).toBeVisible();

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
