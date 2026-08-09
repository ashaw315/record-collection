import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §10: `/records/new` is "Form prefilled from a lookup result, or blank
 * for manual entry. **All prefilled fields remain editable** — the user
 * verifies against the physical record and corrects."
 *
 * That is §5.7's two-stage import seen from the screen: the release endpoint
 * returns the normalized payload, the form renders it, the user checks it
 * against the object in their hand, and only then does anything get written.
 * "There is no path that writes a record straight from a search result without
 * passing through the form."
 *
 * These specs drive the real form against a stubbed Discogs response — the
 * network is intercepted at the browser, so no live call happens (CLAUDE.md
 * §2) and the test exercises the actual prefill wiring rather than a mock of
 * it.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

/** The 1982 UK Clay first pressing, in the shape §5.7's release endpoint emits. */
const RELEASE = {
  discogsId: 381756,
  masterId: 50683,
  title: 'Hear Nothing See Nothing Say Nothing',
  artist: 'Discharge',
  artistDiscogsId: 257137,
  label: 'Clay Records',
  labelDiscogsId: 2069,
  catalogNumber: 'CLAY LP 3',
  country: 'UK',
  year: 1982,
  formats: ['Vinyl', 'LP', 'Album'],
  isReissue: false,
  images: [],
  matrixRunout: ['BACK WITH BILBO CLAY-LP-3-A2 DAMONT'],
  otherIdentifiers: [],
  pressingPlant: 'Damont',
  vinylWeightGrams: 230,
  colorVariant: null,
  tracklist: [],
  genres: ['Rock'],
  styles: ['Hardcore', 'Punk'],
  notes: null,
  numForSale: 11,
  lowestPrice: 43.96,
};

async function login(page: Page) {
  await page.goto('/login');
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/** Answers the release endpoint from a fixture, so nothing reaches Discogs. */
async function stubRelease(page: Page, release: unknown = RELEASE) {
  await page.route('**/api/discogs/release/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(release),
    });
  });
}

async function formReady(page: Page): Promise<void> {
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('prefills the record form from a Discogs release', async ({ page }) => {
  await stubRelease(page);

  await page.goto('/records/new?discogsReleaseId=381756');
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
  await stubRelease(page);

  await page.goto('/records/new?discogsReleaseId=381756');
  await formReady(page);

  await expect(page.getByLabel('Catalog no.')).toHaveValue('CLAY LP 3');
  await expect(page.getByLabel('Country')).toHaveValue('UK');
  await expect(page.getByLabel('Year pressed')).toHaveValue('1982');
  await expect(page.getByLabel('Pressing plant')).toHaveValue('Damont');
  await expect(page.getByLabel('Matrix / runout')).toHaveValue(
    'BACK WITH BILBO CLAY-LP-3-A2 DAMONT',
  );
});

test('every prefilled field stays editable', async ({ page }) => {
  /**
   * §10 says so in as many words, and §5.7 explains why: the user may be
   * holding a different pressing than the one they searched, and Discogs is
   * user-submitted data that is "a strong starting point, never proof".
   */
  await stubRelease(page);

  await page.goto('/records/new?discogsReleaseId=381756');
  await formReady(page);

  /**
   * The starting state has to be the PREFILLED one, or this test cannot tell
   * editing from typing into an empty form — it passed against the unprefilled
   * build on its first run, which is the same non-discriminating fixture that
   * caught me on the want-list pressing prefill in step 6.
   */
  await expect(page.getByLabel('Matrix / runout')).toHaveValue(
    'BACK WITH BILBO CLAY-LP-3-A2 DAMONT',
  );
  await expect(page.getByLabel('Title')).toHaveValue('Hear Nothing See Nothing Say Nothing');

  await page.getByLabel('Matrix / runout').fill('MY OWN READING FROM THE WAX');
  await expect(page.getByLabel('Matrix / runout')).toHaveValue('MY OWN READING FROM THE WAX');

  await page.getByLabel('Title').fill('Hear Nothing (my copy)');
  await expect(page.getByLabel('Title')).toHaveValue('Hear Nothing (my copy)');
});

test('saves what the user confirmed, not what Discogs said', async ({ page }) => {
  /**
   * The property the two-stage flow exists for. The user corrects the matrix
   * from the dead wax — CLAUDE.md §8 calls that field user-authoritative — and
   * the saved record must carry THEIR value.
   */
  await stubRelease(page);

  await page.goto('/records/new?discogsReleaseId=381756');
  await formReady(page);

  await page.getByLabel('Matrix / runout').fill('CORRECTED A1/B1 VARIANT 3');
  await page.getByRole('button', { name: /Add record|Add to collection/ }).click();

  await expect(page).toHaveURL(/\/records\/[0-9a-f-]{36}$/, { timeout: 15_000 });

  const recordId = page.url().split('/').pop();
  const record = await (await page.request.get(`/api/records/${recordId}`)).json();

  expect(record.pressing?.matrixRunout).toBe('CORRECTED A1/B1 VARIANT 3');
  expect(record.title).toBe('Hear Nothing See Nothing Say Nothing');
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
   * Discogs being unreachable, or the id being wrong, must not produce a form
   * carrying some fields and not others — the user would have no way to tell
   * which came from the lookup and which they still have to check.
   */
  await page.route('**/api/discogs/release/**', async (route) => {
    await route.fulfill({
      status: 404,
      contentType: 'application/json',
      body: JSON.stringify({ error: { message: 'Not found on Discogs', code: 'NOT_FOUND' } }),
    });
  });

  await page.goto('/records/new?discogsReleaseId=99999999');
  await formReady(page);

  await expect(page.getByLabel('Title')).toHaveValue('');
  await expect(page.getByTestId('prefill-failed')).toBeVisible();
});
