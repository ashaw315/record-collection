import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { matchOwnershipForResults } from '@/lib/db/queries/ownership';

/**
 * §10 puts an ownership badge on EVERY result card, and a Discogs search page
 * is 25-50 results. Resolving them one at a time would be one round trip per
 * card — 50 sequential queries before the screen can render, on a phone, in a
 * shop, which is the slowest possible place to be doing it.
 *
 * This is the batch form. It exists for latency, so the tests that matter are
 * the ones proving it agrees with the single-result matcher rather than taking
 * a shortcut that only looks right on a uniform fixture.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const TITLE = 'Hear Nothing See Nothing Say Nothing';
const OWNED_EXACT = 381756;
const OWNED_OTHER = 6779382;
const NEVER_SEEN = 999001;
const ON_WANT_LIST = 999002;

async function seedCollection() {
  const artist = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES ('Discharge') RETURNING id`,
  );
  const artistId = artist.rows[0].id;

  const exactPressing = await db.execute<{ id: string }>(
    sql`INSERT INTO pressings (discogs_release_id, catalog_number, country_pressed, year_pressed)
        VALUES (${OWNED_EXACT}, 'CLAY LP 3', 'UK', 1982) RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO records (artist_id, pressing_id, title)
        VALUES (${artistId}, ${exactPressing.rows[0].id}, ${TITLE})`,
  );

  // A DIFFERENT album, owned in a different pressing, for the tier-2 case.
  const otherPressing = await db.execute<{ id: string }>(
    sql`INSERT INTO pressings (discogs_release_id, catalog_number, country_pressed, year_pressed)
        VALUES (${OWNED_OTHER}, 'CLAY LP 5', 'UK', 1989) RETURNING id`,
  );
  await db.execute(
    sql`INSERT INTO records (artist_id, pressing_id, title)
        VALUES (${artistId}, ${otherPressing.rows[0].id}, 'Never Again')`,
  );

  await db.execute(
    sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${artistId}, 'Why', 2)`,
  );

  return { artistId };
}

describe('resolving a page of results at once', () => {
  it('returns a match for every result, keyed by discogs id', async () => {
    await seedCollection();

    const matches = await matchOwnershipForResults([
      { discogsId: OWNED_EXACT, artist: 'Discharge', title: TITLE },
      { discogsId: NEVER_SEEN, artist: 'Discharge', title: 'Realities Of War' },
    ]);

    expect(matches.size, 'one entry per result, none dropped').toBe(2);
    expect(matches.get(OWNED_EXACT)?.tier).toBe('exact');
    expect(matches.get(NEVER_SEEN)?.tier).toBe('none');
  });

  it('gives DIFFERENT tiers to different results on one page', async () => {
    /**
     * The discriminating fixture. A batch resolver that computed one answer and
     * applied it to every row would pass any test where the page is uniform —
     * and a real search page is mostly the same album in different pressings,
     * which is exactly where a uniform answer looks plausible.
     */
    await seedCollection();

    const matches = await matchOwnershipForResults([
      { discogsId: OWNED_EXACT, artist: 'Discharge', title: TITLE },
      { discogsId: OWNED_OTHER, artist: 'Discharge', title: 'Never Again' },
      { discogsId: ON_WANT_LIST, artist: 'Discharge', title: 'Why' },
      { discogsId: NEVER_SEEN, artist: 'Discharge', title: 'Realities Of War' },
    ]);

    expect(matches.get(OWNED_EXACT)?.tier).toBe('exact');
    expect(matches.get(OWNED_OTHER)?.tier).toBe('exact');
    expect(matches.get(ON_WANT_LIST)?.tier).toBe('wanted');
    expect(matches.get(NEVER_SEEN)?.tier).toBe('none');

    const tiers = [...matches.values()].map((match) => match.tier);
    expect(new Set(tiers).size, 'the page is not uniform').toBeGreaterThan(1);
  });

  it('reports a different pressing of an album owned in another', async () => {
    // The tier that matters, resolved in a batch: the user owns the 1982
    // pressing and is looking at a 1989 one of the same album.
    await seedCollection();

    const matches = await matchOwnershipForResults([
      { discogsId: 999999, artist: 'Discharge', title: TITLE },
    ]);

    const match = matches.get(999999)!;
    expect(match.tier).toBe('different-pressing');
    expect(match.ownedPressing?.yearPressed, 'and names which one').toBe(1982);
  });

  it('agrees with the single-result matcher on every row', async () => {
    /**
     * The property that makes the batch form safe to use: it is an
     * OPTIMISATION, not a second implementation of §7.7. If the two ever
     * disagree, the screen shows something no test of `matchOwnership` covers.
     */
    const { matchOwnership } = await import('@/lib/db/queries/ownership');
    await seedCollection();

    const results = [
      { discogsId: OWNED_EXACT, artist: 'Discharge', title: TITLE },
      { discogsId: 999999, artist: 'Discharge', title: TITLE },
      { discogsId: ON_WANT_LIST, artist: 'Discharge', title: 'Why' },
      { discogsId: NEVER_SEEN, artist: 'Discharge', title: 'Realities Of War' },
    ];

    const batch = await matchOwnershipForResults(results);

    for (const result of results) {
      const single = await matchOwnership({
        discogsReleaseId: result.discogsId,
        artist: result.artist,
        title: result.title,
      });

      expect(batch.get(result.discogsId), `result ${result.discogsId}`).toEqual(single);
    }
  });

  it('handles an empty page without querying anything', async () => {
    const matches = await matchOwnershipForResults([]);

    expect(matches.size).toBe(0);
  });

  it('handles a result with no artist or title', async () => {
    // Discogs search rows can be sparse; a missing artist must not throw and
    // must not match everything.
    await seedCollection();

    const matches = await matchOwnershipForResults([
      { discogsId: NEVER_SEEN, artist: null, title: null },
    ]);

    expect(matches.get(NEVER_SEEN)?.tier).toBe('none');
  });
});
