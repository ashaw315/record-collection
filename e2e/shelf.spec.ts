import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC.md §10b — the shelf, and pulling a record off it.
 *
 * **These exist because unit tests could not have caught any of the three
 * defects this feature shipped and then fixed**: five genre sections that
 * rendered as empty black bands, spine text clipped at both ends, and a turn
 * that was a panel swap wearing a rotation's clothes. All three were found by
 * looking at the screen.
 *
 * What a test CAN hold down is the behaviour underneath: that a spine leads
 * somewhere, that turning shows the other side, and that the gatefold
 * affordance appears only where an inner image exists — which is §10b's
 * strictest rule, because there is no generated stand-in for artwork.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

const suffix = () => `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

/** A record on the shelf, returning both ids the callers need. */
async function seedRecord(page: Page, title: string) {
  const artist = await page.request.post('/api/artists', {
    data: { name: `Shelf-${suffix()}` },
  });
  const artistId = (await artist.json()).id as string;

  const record = await page.request.post('/api/records', {
    data: { title, artistId },
  });
  expect(record.status(), 'the fixture must exist for this to test anything').toBe(201);

  // The artist id travels back so a caller can SCOPE its view to this run's
  // fixture. The table paginates at 50 and does not filter by default, so an
  // unscoped assertion looks for a record that may be on page 3 — which is what
  // `record-detail.spec.ts` records costing it three separate defects.
  return { id: (await record.json()).id as string, artistId };
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test('the shelf is the default view, and a spine names its record', async ({ page }) => {
  /**
   * §10b makes the shelf "the default view of `/` on desktop" — asserted
   * because it is a contract change that broke 22 specs when it landed, and the
   * thing that broke them was the default rather than the shelf.
   *
   * The spine's accessible name is the RECORD, not its truncated visible text.
   * That was a real defect: a link reading "Luther Vandross  Nev…  FE 37451"
   * names nothing to a screen reader or to any consumer.
   */
  const title = `Shelved ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');

  await expect(page.getByTestId('shelf')).toBeVisible();
  await expect(
    page.getByRole('link', { name: new RegExp(title) }),
    'the spine is named by the record, whatever its spine text says',
  ).toBeVisible();
});

test('a spine is a link, so it survives without JavaScript', async ({ page }) => {
  /**
   * §10b pulls the record into view rather than navigating, which reads as a
   * button — and making it one broke eight specs across five files. The element
   * is a LINK whose click is intercepted: `preventDefault` upgrades it, so the
   * href still goes somewhere correct if the handler never runs.
   *
   * Asserted through the href rather than by disabling JavaScript, because the
   * property is that the fallback EXISTS.
   */
  const title = `Linked ${suffix()}`;
  const { id } = await seedRecord(page, title);

  await page.goto('/');

  await expect(page.getByRole('link', { name: new RegExp(title) })).toHaveAttribute(
    'href',
    `/records/${id}`,
  );
});

test('clicking a spine pulls the record out, and turning shows the back', async ({ page }) => {
  /**
   * §10b's core interaction. The BACK is the interesting half: "the back face
   * is never empty … every record is a two-sided object from the day it is
   * entered", so a record with no photographs at all still turns over and shows
   * what is known.
   *
   * This fixture has neither cover nor back, which is the common state after
   * §10's quick in-store entry — so the front and the back are both composed,
   * and the test proves the record is two-sided regardless.
   */
  const title = `Turnable ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(title) }).click();

  const pulled = page.getByTestId('pulled-record');
  await expect(pulled).toBeVisible();
  await expect(pulled).toHaveAttribute('data-face', 'front');

  await page.getByTestId('turn-record').click();
  await expect(pulled).toHaveAttribute('data-face', 'back');
  await expect(
    page.getByTestId('composed-face'),
    'the back is composed from what is known, never blank',
  ).toBeVisible();

  // §10b: "click again puts it back."
  await page.getByTestId('turn-record').click();
  await expect(pulled).toHaveAttribute('data-face', 'front');
});

test('the gatefold affordance is absent without an inner image', async ({ page }) => {
  /**
   * §10b's strictest rule: "the state exists only where an inner image has been
   * photographed. There is no generated stand-in: the point of a gatefold is
   * the artwork inside it, and a panel of pressing details folded open where a
   * photograph should be would be inventing the thing the user came to see."
   *
   * So the ABSENCE is the assertion. A record with no inner photograph has two
   * faces and nothing suggests otherwise.
   */
  const title = `Plain ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(title) }).click();

  await expect(page.getByTestId('pulled-record')).toBeVisible();
  await expect(page.getByTestId('turn-record'), 'it still turns over').toBeVisible();
  await expect(
    page.getByTestId('open-gatefold'),
    'but nothing offers to open a sleeve that does not fold',
  ).toHaveCount(0);
});

test('the pulled record can be put back, and by Escape', async ({ page }) => {
  const title = `Closable ${suffix()}`;
  await seedRecord(page, title);

  await page.goto('/');
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('pulled-record')).toBeVisible();

  await page.getByTestId('put-back').click();
  await expect(page.getByTestId('pulled-record')).toHaveCount(0);

  // Escape is the other way out, as it is on any overlay.
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await expect(page.getByTestId('pulled-record')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByTestId('pulled-record')).toHaveCount(0);
});

test('the table view is still reachable, and the shelf is not forced', async ({ page }) => {
  // §10b makes the shelf the default; §10's toggle still reaches the others.
  // The shelf is a third mode rather than a replacement.
  const title = `Tabled ${suffix()}`;
  const { artistId } = await seedRecord(page, title);

  // Scoped to this run's artist: the table paginates at 50, so an unfiltered
  // page 1 is whatever other specs happened to create.
  await page.goto(`/?view=table&artistId=${artistId}`);

  await expect(page.getByTestId('shelf')).toHaveCount(0);
  await expect(page.getByRole('link', { name: new RegExp(title) })).toBeVisible();
});
