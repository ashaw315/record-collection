import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import {
  MARKET_CACHE_TTL_MS,
  readCachedMarket,
  writeCachedMarket,
} from '@/lib/discogs/market-cache';
import { readCachedRelease, writeCachedRelease } from '@/lib/discogs/cache';

/**
 * SPEC.md §10a, "Where it is cached" — a separate `market_cache` table
 * (`discogs_release_id`, `payload JSONB`, `fetched_at`), same 7-day rule as §6
 * and the same stale-read behaviour.
 *
 * **The boundary fixtures sit ON the boundary.** 6, exactly 7 and 8 days are
 * the only values that tell `>` from `>=`; "an hour old" and "a year old" pass
 * under either rule. The exactly-7 case decides it, so it gets its own test.
 *
 * The clock is injected for the reason it is everywhere else here: the
 * alternative is a test that passes only on a particular Tuesday.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const DAY_MS = 24 * 60 * 60 * 1000;

/** A fixed instant, so "6 days old" means the same thing on every run. */
const NOW = new Date('2026-08-08T12:00:00.000Z').getTime();

const RELEASE_ID = 381756;

/** Shaped like the normalized layers 1–2 this table actually stores. */
function marketFor(low: number) {
  return {
    forSale: 3,
    lowestPrice: { value: low, currency: 'USD' },
    range: { low, high: low * 4, currency: 'USD' },
    rangeUnavailable: false,
  };
}

const at = (days: number) => () => NOW - days * DAY_MS;

describe('market cache freshness', () => {
  it('serves a payload written under 7 days ago', async () => {
    await writeCachedMarket(RELEASE_ID, marketFor(20), at(6));

    const hit = await readCachedMarket(RELEASE_ID, () => NOW);

    expect(hit).not.toBeNull();
    expect(hit?.payload).toEqual(marketFor(20));
  });

  it('treats an entry exactly 7 days old as a MISS', async () => {
    /**
     * The case that decides `<` from `<=`. §10a inherits §6's wording —
     * "under 7 days" — so exactly seven is not under it.
     */
    await writeCachedMarket(RELEASE_ID, marketFor(20), at(7));

    expect(await readCachedMarket(RELEASE_ID, () => NOW)).toBeNull();
  });

  it('treats an entry older than 7 days as a miss', async () => {
    await writeCachedMarket(RELEASE_ID, marketFor(20), at(8));

    expect(await readCachedMarket(RELEASE_ID, () => NOW)).toBeNull();
  });

  it('returns null when the release has never been cached', async () => {
    expect(await readCachedMarket(RELEASE_ID, () => NOW)).toBeNull();
  });

  it('exports the TTL as seven days', () => {
    expect(MARKET_CACHE_TTL_MS).toBe(7 * DAY_MS);
  });
});

describe('stale entries are left in place', () => {
  it('does not delete the row it read as stale', async () => {
    /**
     * §10a: "a stale entry reads as a miss but is left in place, so a Discogs
     * outage serves week-old figures rather than nothing."
     *
     * Deleting on read would turn a temporary outage into permanent loss —
     * the refresh that follows a miss is exactly the call that can fail.
     */
    await writeCachedMarket(RELEASE_ID, marketFor(20), at(30));

    expect(await readCachedMarket(RELEASE_ID, () => NOW)).toBeNull();

    const rows = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM market_cache WHERE discogs_release_id = ${RELEASE_ID}`,
    );
    expect(rows.rows[0].n, 'the stale row survives being read as a miss').toBe(1);
  });
});

describe('writing', () => {
  it('upserts rather than accumulating rows per release', async () => {
    // Re-fetching a release whose entry expired is the normal path, and
    // `discogs_release_id` is UNIQUE — a plain insert would throw on it.
    await writeCachedMarket(RELEASE_ID, marketFor(20), at(30));
    await writeCachedMarket(RELEASE_ID, marketFor(55), () => NOW);

    const rows = await db.execute<{ n: number }>(
      sql`SELECT COUNT(*)::int AS n FROM market_cache WHERE discogs_release_id = ${RELEASE_ID}`,
    );
    expect(rows.rows[0].n, 'refreshed, not duplicated').toBe(1);

    const hit = await readCachedMarket(RELEASE_ID, () => NOW);
    expect(hit?.payload).toEqual(marketFor(55));
  });

  it('moves fetched_at forward with the payload', async () => {
    /**
     * Refreshing the data while leaving an old timestamp would serve the new
     * payload once and then treat it as stale for ever.
     */
    await writeCachedMarket(RELEASE_ID, marketFor(20), at(30));
    await writeCachedMarket(RELEASE_ID, marketFor(55), () => NOW);

    expect(await readCachedMarket(RELEASE_ID, () => NOW)).not.toBeNull();
  });
});

describe('market_cache and discogs_cache are separate stores', () => {
  it('a cached market payload does not appear as a cached RELEASE', async () => {
    /**
     * **The whole reason for a second table** (§10a): `discogs_cache` holds
     * release *detail*, which the §5.7 import path reads to build records.
     * Marketplace figures written under the same key would be handed to the
     * importer as a release payload — an import silently built from a price
     * blob.
     *
     * Both directions asserted: neither store may satisfy a read of the other.
     */
    await writeCachedMarket(RELEASE_ID, marketFor(20), () => NOW);

    expect(await readCachedRelease(RELEASE_ID, () => NOW)).toBeNull();
  });

  it('a cached release does not satisfy a market read', async () => {
    await writeCachedRelease(RELEASE_ID, { id: RELEASE_ID, title: 'Hear Nothing' }, () => NOW);

    expect(await readCachedMarket(RELEASE_ID, () => NOW)).toBeNull();
  });

  it('the same release id can sit in both stores at once', async () => {
    // The normal state once a release has been both imported and priced.
    await writeCachedRelease(RELEASE_ID, { id: RELEASE_ID, title: 'Hear Nothing' }, () => NOW);
    await writeCachedMarket(RELEASE_ID, marketFor(20), () => NOW);

    expect((await readCachedRelease(RELEASE_ID, () => NOW))?.payload).toEqual({
      id: RELEASE_ID,
      title: 'Hear Nothing',
    });
    expect((await readCachedMarket(RELEASE_ID, () => NOW))?.payload).toEqual(marketFor(20));
  });
});
