import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import {
  CACHE_TTL_MS,
  readCachedRelease,
  writeCachedRelease,
} from '@/lib/discogs/cache';

/**
 * SPEC.md §6: "cache release detail responses in a `discogs_cache` table
 * (`discogs_release_id`, `payload JSONB`, `fetched_at`). Serve from cache if
 * `fetched_at` is under 7 days old. Search results are not cached."
 *
 * **The fixtures sit ON the boundary, not near it.** Entries at 6, exactly 7
 * and 8 days are the only way to tell `>` from `>=` — a test using "one hour
 * old" and "one year old" passes under either, which is the two-row-sort-seed
 * failure from NOTES in date form. The exactly-7 case is the one that decides
 * the rule, so it gets its own test rather than being implied.
 *
 * The clock is INJECTED for the same reason it is in the limiter: the
 * alternative is a test that only passes on a particular Tuesday, or one that
 * writes rows dated relative to `now()` and cannot express "exactly at the
 * boundary" without a race.
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

const RELEASE_ID = 249504;

function payloadFor(id: number) {
  return { id, title: 'Hear Nothing See Nothing Say Nothing', year: 1982 };
}

/** Writes a row whose `fetched_at` is exactly `ageDays` old relative to NOW. */
async function seedEntry(discogsReleaseId: number, ageDays: number, payload?: unknown) {
  const fetchedAt = new Date(NOW - ageDays * DAY_MS);

  await db.execute(
    sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
        VALUES (${discogsReleaseId},
                ${JSON.stringify(payload ?? payloadFor(discogsReleaseId))}::jsonb,
                ${fetchedAt.toISOString()})`,
  );
}

describe('the 7-day freshness boundary', () => {
  it('agrees with SPEC §6 on what 7 days means', () => {
    // The constant, asserted directly. Every test below is written in days
    // against this; if it silently became 7 hours they would all still pass
    // relative to each other.
    expect(CACHE_TTL_MS).toBe(7 * DAY_MS);
  });

  it('serves an entry 6 days old', async () => {
    await seedEntry(RELEASE_ID, 6);

    const hit = await readCachedRelease(RELEASE_ID, () => NOW);

    expect(hit).not.toBeNull();
    expect(hit?.payload).toEqual(payloadFor(RELEASE_ID));
  });

  it('does NOT serve an entry exactly 7 days old', async () => {
    /**
     * §6 says "under 7 days". Exactly 7 is not under 7, so this is a MISS —
     * and it is the single case that separates `age < TTL` from `age <= TTL`.
     * Both implementations pass the 6-day and 8-day tests.
     */
    await seedEntry(RELEASE_ID, 7);

    expect(await readCachedRelease(RELEASE_ID, () => NOW)).toBeNull();
  });

  it('does not serve an entry 8 days old', async () => {
    await seedEntry(RELEASE_ID, 8);

    expect(await readCachedRelease(RELEASE_ID, () => NOW)).toBeNull();
  });

  it('serves an entry one millisecond inside the boundary', async () => {
    // The other side of the same line, to the finest resolution the column
    // holds. Together with the exactly-7 case this pins the comparison.
    const fetchedAt = new Date(NOW - (7 * DAY_MS - 1));
    await db.execute(
      sql`INSERT INTO discogs_cache (discogs_release_id, payload, fetched_at)
          VALUES (${RELEASE_ID}, ${JSON.stringify(payloadFor(RELEASE_ID))}::jsonb,
                  ${fetchedAt.toISOString()})`,
    );

    expect(await readCachedRelease(RELEASE_ID, () => NOW)).not.toBeNull();
  });

  it('treats a stale entry as absent rather than deleting it', async () => {
    /**
     * A miss must not be destructive. The refresh that follows may fail — if
     * Discogs is down or rate-limiting — and a stale payload is far better
     * than nothing when the alternative is an empty form. Deleting on read
     * would turn a temporary outage into permanent data loss.
     */
    await seedEntry(RELEASE_ID, 8);

    await readCachedRelease(RELEASE_ID, () => NOW);

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM discogs_cache WHERE discogs_release_id = ${RELEASE_ID}`,
    );
    expect(rows.rows[0].n, 'the stale row survives the miss').toBe(1);
  });
});

describe('reading', () => {
  it('is a miss when nothing was ever cached', async () => {
    expect(await readCachedRelease(RELEASE_ID, () => NOW)).toBeNull();
  });

  it('returns the payload for the requested release, not merely any row', async () => {
    // The discriminating fixture: two entries, both fresh, different payloads.
    // A query missing its WHERE clause returns whichever row came first and
    // passes any single-entry test.
    await seedEntry(RELEASE_ID, 1);
    await seedEntry(RELEASE_ID + 1, 1);

    const hit = await readCachedRelease(RELEASE_ID + 1, () => NOW);

    expect(hit?.payload).toEqual(payloadFor(RELEASE_ID + 1));
  });

  it('reports when the entry was fetched, so a caller can say how old it is', async () => {
    // §5.7 requires Discogs data to be presented as a strong starting point,
    // never as certain — showing its age is part of that, so the timestamp has
    // to survive the read.
    await seedEntry(RELEASE_ID, 3);

    const hit = await readCachedRelease(RELEASE_ID, () => NOW);

    expect(hit?.fetchedAt.getTime()).toBe(NOW - 3 * DAY_MS);
  });
});

describe('writing', () => {
  it('stores a payload that reads back identically', async () => {
    const payload = payloadFor(RELEASE_ID);

    await writeCachedRelease(RELEASE_ID, payload);

    const hit = await readCachedRelease(RELEASE_ID, () => NOW);
    expect(hit?.payload).toEqual(payload);
  });

  it('refreshes an existing entry rather than failing on the unique index', async () => {
    /**
     * `discogs_release_id` is UNIQUE, so a second write for the same release
     * must UPSERT. A plain insert raises 23505 — and re-fetching a release
     * whose cache has expired is the normal path, not an edge case.
     */
    await seedEntry(RELEASE_ID, 30, { id: RELEASE_ID, title: 'Stale' });

    await writeCachedRelease(RELEASE_ID, { id: RELEASE_ID, title: 'Fresh' }, () => NOW);

    const hit = await readCachedRelease(RELEASE_ID, () => NOW);
    expect(hit?.payload).toEqual({ id: RELEASE_ID, title: 'Fresh' });

    const rows = await db.execute<{ n: number }>(
      sql`SELECT count(*)::int AS n FROM discogs_cache WHERE discogs_release_id = ${RELEASE_ID}`,
    );
    expect(rows.rows[0].n, 'refreshed, not duplicated').toBe(1);
  });

  it('moves fetched_at forward on refresh, so the entry becomes fresh again', async () => {
    // The point of the upsert. Overwriting the payload while leaving a
    // 30-day-old timestamp means the new data is served once and then
    // considered stale for ever.
    await seedEntry(RELEASE_ID, 30, { id: RELEASE_ID, title: 'Stale' });

    await writeCachedRelease(RELEASE_ID, { id: RELEASE_ID, title: 'Fresh' }, () => NOW);

    const hit = await readCachedRelease(RELEASE_ID, () => NOW);
    expect(hit?.fetchedAt.getTime()).toBe(NOW);
  });

  it('stores nested structures rather than flattening them to text', async () => {
    /**
     * The column is JSONB and release payloads are deeply nested — images,
     * tracklist, identifiers. A write that stringified would read back as a
     * string and every downstream normalizer would receive prose.
     */
    const payload = {
      id: RELEASE_ID,
      images: [{ type: 'primary', uri: 'https://example.test/a.jpg' }],
      identifiers: [{ type: 'Matrix / Runout', value: 'CLAYLP3 A1' }],
      tracklist: [{ position: 'A1', title: 'Hear Nothing' }],
    };

    await writeCachedRelease(RELEASE_ID, payload);

    const hit = await readCachedRelease(RELEASE_ID, () => NOW);
    expect(hit?.payload).toEqual(payload);
    expect(Array.isArray((hit?.payload as { images: unknown[] }).images)).toBe(true);
  });
});
