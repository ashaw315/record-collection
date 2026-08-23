import { expect, test, type Page } from '@playwright/test';
import { registerCleanup, trackArtist } from './cleanup';

/**
 * **The summary card's height is a constant, and that is the claim everything
 * else rests on.**
 *
 * The pulled record's size candidates each reserved a fraction of the frame for
 * facts. While the card grew with the record, that reservation was a GUESS
 * ABOUT CONTENT — three lines and a void for a sparse record, an overflow for a
 * fully-documented one. Reducing the card to artist, title, year and a tap makes
 * the reservation knowable, and the record takes everything else.
 *
 * **So this measures both extremes against each other.** A record with nothing
 * recorded beyond artist/title/year, and one with every optional field
 * populated. If those two produce different card heights, the reservation is a
 * guess again and the size rule built on it is wrong.
 *
 * Neither of the earlier candidate specs had this fixture, which is why the
 * problem survived three rounds of size-tuning: every comparison was rendered
 * against the same sparse seeded record, so the card never grew and the
 * reservation never looked like a guess.
 *
 * **Measured in a browser, never asserted on the caption.** This unit has
 * already been caught by a page that told the truth in text and a lie in pixels
 * (NOTES); the assertion reads rendered geometry.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

async function login(page: Page) {
  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');
}

/**
 * Two records on one artist: one bare, one carrying every optional field.
 *
 * The populated one goes through `/api/records` with its pressing fields, so the
 * panel's groups are built by the same path the app uses rather than by a
 * fixture that asserts its own shape.
 */
async function seedExtremes(
  page: Page,
): Promise<{ artistId: string; sparseId: string; fullId: string }> {
  const run = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

  const artist = await page.request.post('/api/artists', { data: { name: `Summary-${run}` } });
  expect(artist.status(), 'the fixture must exist for this to test anything').toBe(201);
  const artistId = (await artist.json()).id as string;
  trackArtist(artistId);

  const sparse = await page.request.post('/api/records', {
    data: { title: `Sparse ${run}`, artistId, releaseYear: 1982 },
  });
  expect(sparse.status()).toBe(201);
  const sparseId = (await sparse.json()).id as string;

  /*
    **The pressing is its own row, linked by id.** §4 makes pressings shared and
    found-or-created, and `POST /api/records` rejects unknown keys (CLAUDE.md
    §6), so the pressing fields cannot be inlined. This is the same two-step
    `lookup-flows.spec.ts` uses.
  */
  const pressing = await page.request.post('/api/pressings', {
    data: {
      catalogNumber: `KAM ${run.slice(0, 3)}`,
      countryPressed: 'UK',
      yearPressed: 2019,
      pressingPlant: 'Damont',
      matrixRunout: `KAM-${run.slice(0, 3)}-A1`,
      vinylWeightGrams: 180,
      colorVariant: 'Clear',
      isReissue: true,
    },
  });
  /*
    **201 or 200**, and the pair is the point: §4 makes pressings SHARED and
    found-or-created, so a re-run that matches an existing `(catalog_number,
    country_pressed, year_pressed)` correctly gets the existing row back with a
    200. Asserting 201 alone fails on the second run of the day for a reason
    that has nothing to do with this spec's subject.
  */
  expect([200, 201], await pressing.text()).toContain(pressing.status());
  const pressingId = (await pressing.json()).id as string;

  const full = await page.request.post('/api/records', {
    data: {
      title: `Full ${run}`,
      artistId,
      releaseYear: 1982,
      pressingId,
      conditionMedia: 'VG+',
      conditionSleeve: 'VG',
      purchasePrice: '18.00',
      purchaseDate: '2024-03-02',
    },
  });
  expect(full.status(), await full.text()).toBe(201);
  const fullId = (await full.json()).id as string;

  /*
    **The ids are returned, not searched for.** `/api/records?search=` matches
    title AND artist by trigram, so under the full suite a token unique to this
    spec still collides with another spec's record whose ARTIST name shares it —
    `record-detail.spec.ts` seeds `Sparse-<suffix>` / `Bare <suffix>` and that is
    exactly what matched. An id from the create response cannot collide.
  */
  return { artistId, sparseId, fullId };
}

let sparseId: string;
let fullId: string;

test.beforeEach(async ({ page }) => {
  await login(page);
  ({ sparseId, fullId } = await seedExtremes(page));
});

/* Per step 15 unit 1: a spec that leaves records behind slows every later one. */
/* Records and artist removed after each test by the shared tracker. */
registerCleanup();

test('the summary card is the same height for a sparse and a documented record', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });

  const heights: { label: string; height: number; further: string }[] = [];

  for (const { label, id } of [
    { label: 'Sparse', id: sparseId },
    { label: 'Full', id: fullId },
  ] as const) {
    /* Addressed by id, so the workbench renders exactly this record's card. */
    await page.goto(`/plane?recordId=${id}`);

    const card = page.getByTestId('summary-card');
    await expect(card).toBeVisible({ timeout: 40_000 });
    await page.waitForTimeout(400);

    const box = await card.boundingBox();
    expect(box, `${label}: the card has a measurable box`).not.toBeNull();
    if (!box) return;

    heights.push({
      label,
      height: box.height,
      further: await page.getByTestId('summary-further').innerText(),
    });
  }

  expect(heights.length, 'both extremes were measured').toBe(2);
  const [sparse, full] = heights;

  /*
    **The two fixtures must actually DIFFER**, or the equality below is
    vacuous — two identical records trivially produce identical cards, and the
    test would pass against a card that grows with content.
  */
  expect(
    sparse.further,
    `the fixtures must differ in what they record (sparse: "${sparse.further}", full: "${full.further}")`,
  ).not.toBe(full.further);

  /*
    One pixel of tolerance for sub-pixel rounding, not for a line of text: a
    single extra line at this type size is ~16px, so this cannot pass a card
    that grew.
  */
  expect(
    Math.abs(sparse.height - full.height),
    `card heights: sparse ${sparse.height.toFixed(1)}px, full ${full.height.toFixed(1)}px`,
  ).toBeLessThanOrEqual(1);
});

test('the card is a link to the record, and reads as one', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto(`/plane?recordId=${fullId}`);

  const card = page.getByTestId('summary-card');
  await expect(card).toBeVisible({ timeout: 40_000 });

  /*
    **A link, not a click handler.** §10b's keyboard path already reaches
    `/records/[id]` through the accessible list, so this must be the same kind
    of destination — cmd-click, middle-click and a failed hydration all have to
    behave, which is the rule §10 states for a spine.
  */
  await expect(card).toHaveAttribute('href', `/records/${fullId}`);

  /*
    Thumb-reachable per §10: the whole card is the target, not a small control
    beside unclickable text.
  */
  const box = await card.boundingBox();
  expect(box).not.toBeNull();
  if (!box) return;
  expect(box.height, 'the tap target is a comfortable size').toBeGreaterThanOrEqual(44);

  await card.click();
  await expect(page).toHaveURL(`/records/${fullId}`, { timeout: 20_000 });
});
