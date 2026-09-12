import { test, expect } from '@playwright/test';
import { sql } from 'drizzle-orm';
import { getTestDb } from '../../test/helpers/db';

/**
 * **A capture tool, not an assertion.** Regenerates `docs/record-detail/*.png`
 * — the four compositions 7a's grid is judged against.
 *
 *   CAPTURE=1 npx playwright test --project=capture
 *
 * **Skipped unless `CAPTURE=1`.** Playwright has no way to mark a project as
 * opt-in — a bare `npx playwright test` runs every project — so the guard is in
 * the test rather than the config. Without it a full-suite run would spend 20s
 * regenerating committed screenshots and reaching for a remote blob URL, as a
 * side effect of running the tests.
 *
 * **Committed because a capture tool that exists in one session is a
 * measurement nobody can repeat.** These screenshots caught four defects the
 * component tests could not — an illegible label on the filled module, a
 * pale-rectangle fill on a near-grey record, a wrong market figure, and a
 * paired-cell height gap — and they have to be regenerable the next time the
 * grid changes, or the next round is arguing from stale pictures.
 *
 * **The seeded shapes are MEASURED from the real collection**, not invented:
 * field-for-field from Donovan (the modal record), Luther Vandross (the richest
 * at two diagonals), Discharge (the emptiest at three, one crossed) and Donna
 * Summer (the worst case on every axis — 38-character title, four genres, no
 * price history, most chromatic colour). 7a was drawn on a record the collection
 * does not contain, which is why these four exist.
 */

const PASSWORD = process.env.E2E_PASSWORD ?? 'test-password-for-e2e';

test.use({ viewport: { width: 1440, height: 1400 }, deviceScaleFactor: 1 });

const DONOVAN_COVER =
  'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/e73e1de1-3686-4a81-8544-ca2300e187bb/43ecded3-cce0-48c2-9cbc-dc29df091cde.jpg';

type Case = {
  name: string;
  artist: string;
  title: string;
  label: string;
  catalog: string | null;
  country: string;
  year: number;
  pressed: number | null;
  colour: string;
  genres: string[];
  price: string | null;
  store: string | null;
  condition: string | null;
  journal: string | null;
  prices: string[];
  discogs: number | null;
  cover?: string;
};

const CASES: Case[] = [
  {
    /* The modal page: 16 of 17 records render this shape. */
    name: 'modal-donovan',
    artist: 'Donovan',
    title: 'The Hurdy Gurdy Man',
    label: 'Epic',
    catalog: 'BN 26420',
    country: 'United States',
    year: 1968,
    pressed: 1968,
    colour: '#44946b',
    genres: ['Folk Rock', 'Psychedelic Rock'],
    price: null,
    store: null,
    condition: null,
    journal: null,
    prices: ['24.00', '18.50'],
    discogs: 1335509,
  },
  {
    /* The richest: every module populated, so no diagonal at all. */
    name: 'richest-vandross',
    artist: 'Luther Vandross',
    title: 'Never Too Much',
    label: 'Epic',
    catalog: 'FE 36811',
    country: 'United States',
    year: 1981,
    pressed: 1981,
    colour: '#a25829',
    genres: ['Soul', 'Disco'],
    price: '18.00',
    store: 'Academy Records',
    condition: 'VG+',
    journal: 'Bought for the B-side. Sleeve has a split at the bottom seam.',
    prices: ['24.00', '9.99', '61.00'],
    discogs: 1234567,
  },
  {
    /*
      The emptiest, and the only CROSSED diagonal in the collection: no Discogs
      release, so the market figure is not applicable rather than not recorded.
      Its #363129 is chroma 0.016 — one of the six covers no derivation rescues,
      so this is §5's pale-rectangle case rendered rather than argued.
    */
    name: 'emptiest-discharge',
    artist: 'Discharge',
    title: 'Grave New World',
    label: 'Clay Records',
    catalog: null,
    country: 'United Kingdom',
    year: 1986,
    pressed: null,
    colour: '#363129',
    genres: [],
    price: null,
    store: null,
    condition: null,
    journal: null,
    prices: [],
    discogs: null,
  },
  {
    /*
      The worst case on every axis at once: the longest real title at 38
      characters, four genres, six absences, and the only record with no price
      history — but WITH a Discogs release, so single rather than crossed. Its
      #bc4889 at chroma 0.164 is the collection's most chromatic, so the filled
      module here is the opposite end of the range from Discharge's grey.
    */
    name: 'worst-case-donna-summer',
    artist: 'Donna Summer',
    title: 'On The Radio: Greatest Hits Vol. 1 & 2',
    label: 'Casablanca',
    catalog: 'NBLP-2-7191',
    country: 'US',
    year: 1979,
    pressed: 1979,
    colour: '#bc4889',
    genres: ['Electronic', 'Funk / Soul', 'Pop', 'Disco'],
    price: null,
    store: null,
    condition: null,
    journal: null,
    prices: [],
    discogs: 4314002,
    cover:
      'https://z29f9nqxxuy5nwb2.public.blob.vercel-storage.com/records/c61c5919-8f50-4782-8e04-419fb3d2b148/67d2d0e6-d271-4dfb-bc20-6ff54a8e21cc.jpg',
  },
];

/** Names are suffixed per case: labels, artists and genres are unique columns. */
async function seed(c: Case): Promise<string> {
  const db = getTestDb();
  const one = async (query: ReturnType<typeof sql>) =>
    ((await db.execute(query)).rows as Array<{ id: string }>)[0].id;

  const artistId = await one(sql`INSERT INTO artists (name) VALUES (${`${c.artist} ${c.name}`}) RETURNING id`);
  const labelId = await one(sql`INSERT INTO labels (name) VALUES (${`${c.label} ${c.name}`}) RETURNING id`);
  const formatId = await one(sql`INSERT INTO formats (name) VALUES (${`LP ${c.name}`}) RETURNING id`);
  const pressingId = await one(sql`
    INSERT INTO pressings (catalog_number, country_pressed, year_pressed, discogs_release_id)
    VALUES (${c.catalog}, ${c.country}, ${c.pressed}, ${c.discogs}) RETURNING id`);
  const storeId =
    c.store === null
      ? null
      : await one(sql`INSERT INTO record_stores (name) VALUES (${`${c.store} ${c.name}`}) RETURNING id`);

  const recordId = await one(sql`
    INSERT INTO records (artist_id, title, label_id, format_id, pressing_id, store_id,
                         release_year, purchase_price, condition_media, condition_sleeve, spine_colour)
    VALUES (${artistId}::uuid, ${c.title}, ${labelId}::uuid, ${formatId}::uuid,
            ${pressingId}::uuid, ${storeId}, ${c.year}, ${c.price},
            ${c.condition}, ${c.condition}, ${c.colour})
    RETURNING id`);

  for (const genre of c.genres) {
    const genreId = await one(sql`INSERT INTO genres (name) VALUES (${`${genre} ${c.name}`}) RETURNING id`);
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${recordId}::uuid, ${genreId}::uuid)`,
    );
  }
  for (const price of c.prices) {
    await db.execute(sql`
      INSERT INTO price_history (record_id, price, price_type, source)
      VALUES (${recordId}::uuid, ${price}, 'asking', 'discogs')`);
  }
  if (c.journal !== null) {
    await db.execute(sql`
      INSERT INTO journal_entries (record_id, note, entry_date)
      VALUES (${recordId}::uuid, ${c.journal}, '2024-03-14')`);
  }
  await db.execute(sql`
    INSERT INTO images (record_id, url, image_type)
    VALUES (${recordId}::uuid, ${c.cover ?? DONOVAN_COVER}, 'cover')`);

  return recordId;
}

test('capture the grid on the four real compositions', async ({ page }) => {
  test.skip(
    process.env.CAPTURE !== '1',
    'A capture tool: run with CAPTURE=1 npx playwright test --project=capture',
  );

  const ids = await Promise.all(CASES.map(async (c) => [c.name, await seed(c)] as const));

  await page.goto('/login');
  await page.locator('form[data-hydrated="true"]').waitFor({ timeout: 15_000 });
  await page.getByLabel('Password').pressSequentially(PASSWORD);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL('/');

  for (const [name, id] of ids) {
    await page.goto(`/records/${id}`);
    const grid = page.getByTestId('record-grid');
    await grid.waitFor({ timeout: 20_000 });
    /* The cover is a remote blob; a soft wait beats a flaky network assertion. */
    await page.waitForTimeout(900);
    await grid.screenshot({ path: `docs/record-detail/${name}.png` });

    /*
      **And the whole page**, because the seam is only judgeable at full length:
      the grid spans the viewport and the sections below keep a reading measure,
      so whether the screen reads as ONE thing cannot be seen in a crop of it.
    */
    await page.screenshot({ path: `docs/record-detail/${name}-page.png`, fullPage: true });
  }
});
