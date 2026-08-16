import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { GET as getStats } from '@/app/api/records/stats/route';

/**
 * SPEC.md §5.2 `GET /api/records/stats`, and §7.6's estimated-value chain.
 *
 * §7.6: "for each record, the most recent price_history row of type `used`
 * (falling back to `new`, then to `purchase_price`). Sum."
 *
 * Verified against the database before designing: this is per-TYPE recency, not
 * global recency. A record with an OLD `used` price and a NEWER `new` price
 * contributes the used one — type preference beats recency, which is the
 * OPPOSITE of the detail endpoint's "latest price". Keeping the two rules apart
 * is why unit 3 refused to apply this chain there.
 *
 * Each fallback step gets a record that exercises ONLY that step. A fixture
 * where every record has a used price cannot distinguish the chain from "always
 * use used" — the same discipline as the artist sort in unit 4.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

function request(url: string): Request {
  return new Request(`https://x.test${url}`);
}

async function stats(url = '/api/records/stats') {
  const response = await getStats(request(url));
  expect(response.status).toBe(200);
  return response.json();
}

const id = async (statement: ReturnType<typeof sql>) =>
  (await db.execute<{ id: string }>(statement)).rows[0].id;

async function artist(name: string): Promise<string> {
  return id(sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`);
}

async function record(
  artistId: string,
  title: string,
  fields: {
    purchasePrice?: string | null;
    releaseYear?: number | null;
    storeId?: string | null;
    // Added for §5.2's byLabel, which §10's screen asks for.
    labelId?: string | null;
  } = {},
): Promise<string> {
  return id(
    sql`INSERT INTO records (artist_id, title, purchase_price, release_year, store_id, label_id)
        VALUES (${artistId}, ${title}, ${fields.purchasePrice ?? null},
                ${fields.releaseYear ?? null}, ${fields.storeId ?? null},
                ${fields.labelId ?? null})
        RETURNING id`,
  );
}

async function label(name: string): Promise<string> {
  return id(sql`INSERT INTO labels (name) VALUES (${name}) RETURNING id`);
}

async function price(
  recordId: string,
  amount: string,
  // §4.2's amended enum: `best_dig` was migrated out (see §7's correction note)
  // because a pressing modelled as a price is CLAUDE.md §8's conflation written
  // into the schema.
  type: 'used' | 'new' | 'asking',
  recordedAt = '2026-01-01T00:00:00Z',
): Promise<void> {
  await db.execute(
    sql`INSERT INTO price_history (record_id, price, price_type, recorded_at)
        VALUES (${recordId}, ${amount}::numeric, ${type}, ${recordedAt}::timestamptz)`,
  );
}


/**
 * §5.2's routing note has two halves, and only ONE of them can be tested here.
 *
 * Route PRECEDENCE — that the static segment is not swallowed by [id] — is a
 * property of the Next.js router, which is not involved when a test imports a
 * handler and calls it directly. That half lives in
 * e2e/records-routing.spec.ts, where a real request is dispatched; it was
 * mutation-verified by deleting the static route and watching the E2E test
 * fail.
 *
 * This file previously claimed the precedence coverage with a test that called
 * the [id] handler with a hand-made `{ id: 'stats' }` param. That exercised the
 * UUID guard, not routing, and mutation-verified as duplicating
 * 'returns 400 for a non-UUID id' in records-update.test.ts — removing the
 * guard failed both. The comment implied otherwise, which is the part that made
 * it misleading rather than merely redundant.
 *
 * What remains here is the half that IS testable at this layer: the stats
 * handler returns the stats shape.
 */
describe('the stats handler returns the stats shape', () => {
  it('returns the §5.2 fields rather than an error', async () => {
    const body = await stats();

    expect(body).toHaveProperty('totalRecords');
    expect(body).toHaveProperty('byGenre');
    expect(body).not.toHaveProperty('error');
  });
});

describe('GET /api/records/stats — totals', () => {
  it('returns zeroes for an empty collection rather than nulls', async () => {
    const body = await stats();

    expect(body).toMatchObject({ totalRecords: 0, totalSpend: '0.00', estimatedValue: '0.00' });
    expect(body.byGenre).toEqual([]);
    expect(body.byDecade).toEqual([]);
    expect(body.byStore).toEqual([]);
  });

  it('counts records and sums purchase price', async () => {
    const a = await artist('Discharge');
    await record(a, 'One', { purchasePrice: '24.50' });
    await record(a, 'Two', { purchasePrice: '8.00' });

    const body = await stats();

    expect(body.totalRecords).toBe(2);
    expect(body.totalSpend).toBe('32.50');
  });

  it('ignores a null purchase price in the spend total', async () => {
    // A record logged before its price was known must not make the total null.
    const a = await artist('Discharge');
    await record(a, 'Priced', { purchasePrice: '10.00' });
    await record(a, 'Unpriced', { purchasePrice: null });

    const body = await stats();

    expect(body.totalRecords).toBe(2);
    expect(body.totalSpend).toBe('10.00');
  });
});

/**
 * The fallback chain. Each record below exercises exactly ONE step, so the
 * suite can tell the chain from any single-rule shortcut.
 */
describe('GET /api/records/stats — §7.6 estimated value', () => {
  it('uses the most recent USED price when one exists', async () => {
    const a = await artist('Discharge');
    const r = await record(a, 'Used only', { purchasePrice: '5.00' });
    await price(r, '10.00', 'used', '2020-01-01');
    await price(r, '30.00', 'used', '2024-01-01');

    expect((await stats()).estimatedValue).toBe('30.00');
  });

  /**
   * The step that distinguishes the chain from global recency: an OLD used
   * price and a NEWER new price. §7.6 prefers the TYPE, so the older row wins.
   * An implementation ordering by recorded_at alone returns 99.00.
   */
  it('prefers an older USED price over a newer NEW price', async () => {
    const a = await artist('Discharge');
    const r = await record(a, 'Both types', { purchasePrice: '5.00' });
    await price(r, '20.00', 'used', '2020-01-01');
    await price(r, '99.00', 'new', '2024-01-01');

    expect((await stats()).estimatedValue).toBe('20.00');
  });

  it('falls back to NEW when there is no used price', async () => {
    // Exercises step 2 alone: no used row exists at all.
    const a = await artist('Amebix');
    const r = await record(a, 'New only', { purchasePrice: '5.00' });
    await price(r, '45.00', 'new', '2024-01-01');

    expect((await stats()).estimatedValue).toBe('45.00');
  });

  it('uses the most recent NEW price when falling back', async () => {
    const a = await artist('Amebix');
    const r = await record(a, 'Two new', { purchasePrice: '5.00' });
    await price(r, '40.00', 'new', '2020-01-01');
    await price(r, '55.00', 'new', '2024-01-01');

    expect((await stats()).estimatedValue).toBe('55.00');
  });

  it('falls back to PURCHASE PRICE when there is no used or new price', async () => {
    /**
     * Exercises step 3 alone: only an off-chain price row exists, so the
     * purchase price must win.
     *
     * Was `best_dig`, migrated to `asking` in 0005 — the ASSERTION is unchanged
     * because the property it tests is unchanged: a price type outside §7.6's
     * chain must not displace the last link. Only the value's name moved.
     */
    const a = await artist('Antisect');
    const r = await record(a, 'Purchase only', { purchasePrice: '12.75' });
    await price(r, '500.00', 'asking', '2024-01-01');

    expect((await stats()).estimatedValue).toBe('12.75');
  });

  it('contributes zero when a record has no price and no purchase price', async () => {
    const a = await artist('Doom');
    await record(a, 'Nothing', { purchasePrice: null });

    expect((await stats()).estimatedValue).toBe('0.00');
  });

  /**
   * All three steps in ONE collection. A single-rule implementation gets a
   * different total for each: always-used → 30.00, always-recent → 30 + 99,
   * always-purchase → 5 + 5 + 12.75.
   */
  it('sums a collection exercising every step of the chain', async () => {
    const a = await artist('Discharge');

    const usedRecord = await record(a, 'Used', { purchasePrice: '5.00' });
    await price(usedRecord, '30.00', 'used', '2024-01-01');

    const newRecord = await record(a, 'New', { purchasePrice: '5.00' });
    await price(newRecord, '45.00', 'new', '2024-01-01');

    // No price history at all — falls through to purchase price.
    await record(a, 'Purchase', { purchasePrice: '12.75' });

    const body = await stats();

    // 30.00 + 45.00 + 12.75
    expect(body.estimatedValue).toBe('87.75');
    // And the spend total is a DIFFERENT number, so one cannot stand in for
    // the other.
    expect(body.totalSpend).toBe('22.75');
  });

  it('does not let one record’s price contribute to another', async () => {
    const a = await artist('Discharge');
    const first = await record(a, 'Priced', { purchasePrice: null });
    await price(first, '30.00', 'used', '2024-01-01');
    await record(a, 'Unpriced', { purchasePrice: null });

    expect((await stats()).estimatedValue).toBe('30.00');
  });
});

describe('GET /api/records/stats — breakdowns', () => {
  it('groups by genre, counting each record once per genre', async () => {
    const a = await artist('Discharge');
    const uk82 = await id(sql`INSERT INTO genres (name) VALUES ('UK82') RETURNING id`);
    const crust = await id(sql`INSERT INTO genres (name) VALUES ('Crust') RETURNING id`);

    const one = await record(a, 'One');
    const two = await record(a, 'Two');
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${one}, ${uk82})`);
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${two}, ${uk82})`);
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${two}, ${crust})`);

    const body = await stats();
    const byName = Object.fromEntries(
      body.byGenre.map((row: { name: string; count: number }) => [row.name, row.count]),
    );

    expect(byName).toEqual({ UK82: 2, Crust: 1 });
  });

  it('omits genres with no records rather than listing them at zero', async () => {
    await id(sql`INSERT INTO genres (name) VALUES ('Unused') RETURNING id`);

    expect((await stats()).byGenre).toEqual([]);
  });

  /**
   * SPEC.md §7.1 applies to the breakdown as well as the filter: a record
   * tagged Oi! counts towards UK82 and Punk too, or the stats screen (§10)
   * disagrees with the collection screen about how many punk records exist.
   *
   * THREE levels for the same reason as the list tests — two cannot tell a
   * recursive CTE from a single join to parent_genre_id.
   */
  it('rolls a descendant-tagged record up into every ancestor genre', async () => {
    const a = await artist('Discharge');
    const punk = await id(sql`INSERT INTO genres (name) VALUES ('Punk') RETURNING id`);
    const uk82 = await id(
      sql`INSERT INTO genres (name, parent_genre_id) VALUES ('UK82', ${punk}) RETURNING id`,
    );
    const oi = await id(
      sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Oi!', ${uk82}) RETURNING id`,
    );
    const crust = await id(
      sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Crust', ${punk}) RETURNING id`,
    );

    const deep = await record(a, 'Tagged Oi');
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${deep}, ${oi})`);
    const mid = await record(a, 'Tagged UK82');
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${mid}, ${uk82})`);
    const sibling = await record(a, 'Tagged Crust');
    await db.execute(
      sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${sibling}, ${crust})`,
    );

    const body = await stats();
    const byName = Object.fromEntries(
      body.byGenre.map((row: { name: string; count: number }) => [row.name, row.count]),
    );

    // Punk gets all three; UK82 gets the two in its subtree; Oi! and Crust one
    // each. A single join would give Punk 2 (UK82 + Crust) and miss the Oi!
    // record entirely.
    expect(byName).toEqual({ Punk: 3, UK82: 2, 'Oi!': 1, Crust: 1 });
  });

  it('counts a record once per ancestor even when tagged with two of them', async () => {
    // Tagged with BOTH Oi! and Punk: it is one record in the Punk subtree, not
    // two. A CTE joined without DISTINCT double-counts here.
    const a = await artist('Discharge');
    const punk = await id(sql`INSERT INTO genres (name) VALUES ('Punk') RETURNING id`);
    const oi = await id(
      sql`INSERT INTO genres (name, parent_genre_id) VALUES ('Oi!', ${punk}) RETURNING id`,
    );

    const both = await record(a, 'Tagged Twice');
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${both}, ${oi})`);
    await db.execute(sql`INSERT INTO record_genres (record_id, genre_id) VALUES (${both}, ${punk})`);

    const body = await stats();
    const byName = Object.fromEntries(
      body.byGenre.map((row: { name: string; count: number }) => [row.name, row.count]),
    );

    expect(byName).toEqual({ Punk: 1, 'Oi!': 1 });
  });



  it('groups by decade from the release year', async () => {
    const a = await artist('Discharge');
    await record(a, 'Early', { releaseYear: 1981 });
    await record(a, 'Late', { releaseYear: 1989 });
    await record(a, 'Nineties', { releaseYear: 1995 });

    const body = await stats();
    const byDecade = Object.fromEntries(
      body.byDecade.map((row: { decade: number; count: number }) => [row.decade, row.count]),
    );

    // 1981 and 1989 are both the 1980s.
    expect(byDecade).toEqual({ 1980: 2, 1990: 1 });
  });

  it('excludes records with no release year from the decade breakdown', async () => {
    // A null year has no decade; bucketing it as 0 would invent a category.
    const a = await artist('Discharge');
    await record(a, 'Dated', { releaseYear: 1982 });
    await record(a, 'Undated', { releaseYear: null });

    const body = await stats();

    expect(body.byDecade).toHaveLength(1);
    expect(body.byDecade[0]).toMatchObject({ decade: 1980, count: 1 });
    expect(body.totalRecords).toBe(2);
  });

  it('groups by store with counts and spend', async () => {
    const a = await artist('Discharge');
    const amoeba = await id(
      sql`INSERT INTO record_stores (name) VALUES ('Amoeba') RETURNING id`,
    );
    const rough = await id(
      sql`INSERT INTO record_stores (name) VALUES ('Rough Trade') RETURNING id`,
    );

    await record(a, 'One', { storeId: amoeba, purchasePrice: '10.00' });
    await record(a, 'Two', { storeId: amoeba, purchasePrice: '15.00' });
    await record(a, 'Three', { storeId: rough, purchasePrice: '8.00' });

    const body = await stats();
    const byName = Object.fromEntries(
      body.byStore.map((row: { name: string; count: number; spend: string }) => [
        row.name,
        { count: row.count, spend: row.spend },
      ]),
    );

    expect(byName).toEqual({
      Amoeba: { count: 2, spend: '25.00' },
      'Rough Trade': { count: 1, spend: '8.00' },
    });
  });

  it('excludes records with no store from the store breakdown', async () => {
    const a = await artist('Discharge');
    const amoeba = await id(sql`INSERT INTO record_stores (name) VALUES ('Amoeba') RETURNING id`);

    await record(a, 'Known', { storeId: amoeba, purchasePrice: '10.00' });
    await record(a, 'Unknown', { storeId: null, purchasePrice: '99.00' });

    const body = await stats();

    expect(body.byStore).toHaveLength(1);
    expect(body.byStore[0]).toMatchObject({ name: 'Amoeba', count: 1, spend: '10.00' });
    // The unattributed record still counts in the totals.
    expect(body.totalSpend).toBe('109.00');
  });
});

describe('byLabel — §5.2, added when §10 asked for it', () => {
  /**
   * §10's stats screen asks for a breakdown by label, and §5.2's response shape
   * was amended to include `byLabel`. The QUERY was not — the documented shape
   * said one thing and the endpoint returned another.
   *
   * A collection organised around Clay, Dischord or SST is a real way to read a
   * shelf, which is why the screen wants it.
   */
  it('counts records per label, most first', async () => {
    const clay = await label('Clay Records');
    const dischord = await label('Dischord');
    const artistId = await artist('Discharge');

    await record(artistId, 'A', { labelId: clay });
    await record(artistId, 'B', { labelId: clay });
    await record(artistId, 'C', { labelId: dischord });

    const body = await stats();

    expect(body.byLabel.map((row: { name: string; count: number }) => [row.name, row.count])).toEqual([
      ['Clay Records', 2],
      ['Dischord', 1],
    ]);
  });

  it('omits a label with no records rather than reporting zero', async () => {
    // A label the user created and has not used is not a shelf category.
    await label('Unused Records');
    const artistId = await artist('Discharge');
    await record(artistId, 'A');

    expect((await stats()).byLabel).toEqual([]);
  });

  it('excludes records with no label rather than grouping them as one', async () => {
    /**
     * The discriminating case. §4.2 makes `label_id` nullable, and an INNER
     * JOIN is what keeps "no label" from becoming a label called nothing —
     * which would then read as a shelf category on the screen.
     */
    const clay = await label('Clay Records');
    const artistId = await artist('Discharge');

    await record(artistId, 'A', { labelId: clay });
    await record(artistId, 'B');

    const body = await stats();

    expect(body.byLabel).toHaveLength(1);
    expect(body.byLabel[0].count, 'the unlabelled record is not counted').toBe(1);
  });

  it('breaks a tie by name, so the order is stable between calls', async () => {
    // Two labels with one record each must not swap places run to run — a
    // screen that reorders on refresh looks broken.
    const beggars = await label('Beggars');
    const at = await label('Alternative Tentacles');
    const artistId = await artist('Discharge');

    await record(artistId, 'A', { labelId: beggars });
    await record(artistId, 'B', { labelId: at });

    expect((await stats()).byLabel.map((row: { name: string }) => row.name)).toEqual([
      'Alternative Tentacles',
      'Beggars',
    ]);
  });
});

describe('§7.6: an ASKING price never inflates estimated value', () => {
  /**
   * **The most important assertion in this unit.**
   *
   * §7.6's chain is `used` → `new` → `purchase_price`. `asking` is deliberately
   * absent: it is what somebody WANTED, not what anybody paid. A shop tag of
   * £120 on a record that sells for £15 is not evidence the record is worth
   * £120.
   *
   * Same class as the fabricated 230g weight — a value that looks entered and
   * is not supported — except this one compounds into a headline figure on
   * /stats, which is the number a person quotes.
   */
  it('ignores an asking price entirely when nothing else is recorded', async () => {
    const artistId = await artist('Discharge');
    const recordId = await record(artistId, 'Asking Only');
    await price(recordId, '120.00', 'asking');

    const body = await stats();

    expect(body.estimatedValue, 'nobody paid £120, so it is worth nothing known').toBe('0.00');
  });

  it('prefers a real used price over a higher asking price', async () => {
    // The discriminating case: if `asking` were in the chain at all, a higher
    // asking price would win on recency or on ordering and the total would jump.
    const artistId = await artist('Discharge');
    const recordId = await record(artistId, 'Both');
    await price(recordId, '15.00', 'used');
    await price(recordId, '120.00', 'asking');

    const body = await stats();

    expect(body.estimatedValue).toBe('15.00');
  });

  it('falls through an asking price to the purchase price', async () => {
    // `purchase_price` is the last link in the chain and is a fact — money that
    // changed hands. An asking price must not displace it.
    const artistId = await artist('Discharge');
    const recordId = await record(artistId, 'Paid', { purchasePrice: '12.00' });
    await price(recordId, '120.00', 'asking');

    const body = await stats();

    expect(body.estimatedValue).toBe('12.00');
  });

  it('still uses a new price when there is no used one', async () => {
    // The chain's middle link survives the change — this is what stops the fix
    // from being "ignore everything except used".
    const artistId = await artist('Discharge');
    const recordId = await record(artistId, 'Sealed');
    await price(recordId, '40.00', 'new');
    await price(recordId, '120.00', 'asking');

    const body = await stats();

    expect(body.estimatedValue).toBe('40.00');
  });
});
