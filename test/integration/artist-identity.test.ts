import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists } from '@/db/schema';
import { findArtistByMusicbrainzId, findArtistsNamed } from '@/lib/db/queries/artists';

/**
 * SPEC.md §4.1 as amended — **a name no longer identifies an artist.**
 *
 * MusicBrainz carries two distinct UK groups called Discharge. While
 * `artists.name` was UNIQUE the database asserted they were one artist, which
 * is §8's pressing-is-not-an-album hazard at the artist level: it fuses two
 * bands' lineups and records with no error at all.
 *
 * Uniqueness moved to the external ids. These tests cover the two questions
 * that replaced `findArtistByName`, whose single-row contract is no longer true
 * of the schema:
 *
 *   `findArtistByMusicbrainzId` — the identity key.
 *   `findArtistsNamed`          — every artist with a name, count included.
 */

const db = getTestDb();

/** Both real, both importable, one name. */
const DBEAT_MBID = '0c9bfbdc-4e64-497d-bf80-5c891e6766a3';
const OTHER_MBID = 'a2ceee73-7a27-4ebf-96af-471140fb5a42';

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

describe('two artists may share a name (§4.1)', () => {
  it('accepts a second artist with the same name', async () => {
    /**
     * The constraint drop, asserted directly. Before migration 0008 this threw
     * `duplicate key value violates unique constraint "artists_name_unique"`.
     */
    await db.insert(artists).values({ name: 'Discharge', musicbrainzId: DBEAT_MBID });

    await expect(
      db.insert(artists).values({ name: 'Discharge', musicbrainzId: OTHER_MBID }),
    ).resolves.not.toThrow();

    expect(await findArtistsNamed('Discharge')).toHaveLength(2);
  });

  it('still refuses two artists sharing a MusicBrainz id', async () => {
    /**
     * The other half of the same change: uniqueness MOVED, it was not removed.
     * An MBID identifies an artist, so two rows carrying one is a genuine
     * duplicate.
     */
    await db.insert(artists).values({ name: 'Discharge', musicbrainzId: DBEAT_MBID });

    await expect(
      db.insert(artists).values({ name: 'Something Else', musicbrainzId: DBEAT_MBID }),
    ).rejects.toThrow();
  });

  it('allows many artists with no MusicBrainz id', async () => {
    // Partial index: unique only WHEN PRESENT. Adam's hand-entered artists have
    // no MBID and must not collide with each other.
    await db.insert(artists).values([
      { name: 'One', musicbrainzId: null },
      { name: 'Two', musicbrainzId: null },
      { name: 'Three', musicbrainzId: null },
    ]);

    expect(await findArtistByMusicbrainzId(null)).toBeUndefined();
  });
});

describe('findArtistByMusicbrainzId — the identity key', () => {
  it('finds the artist carrying that id', async () => {
    const [created] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: DBEAT_MBID })
      .returning();

    const found = await findArtistByMusicbrainzId(DBEAT_MBID);

    expect(found?.id).toBe(created.id);
  });

  it('distinguishes two same-named artists by their ids', async () => {
    /**
     * **The load-bearing test of this unit.** Both rows are called Discharge;
     * only the MBID tells them apart. A resolver matching on name would return
     * whichever row the planner happened to give it, and attach one band's
     * lineup to the other.
     */
    const [dbeat] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: DBEAT_MBID })
      .returning();
    const [other] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: OTHER_MBID })
      .returning();

    expect((await findArtistByMusicbrainzId(DBEAT_MBID))?.id).toBe(dbeat.id);
    expect((await findArtistByMusicbrainzId(OTHER_MBID))?.id).toBe(other.id);
    expect(dbeat.id, 'genuinely two rows').not.toBe(other.id);
  });

  it('returns undefined for an id nobody carries', async () => {
    await db.insert(artists).values({ name: 'Discharge', musicbrainzId: DBEAT_MBID });

    expect(await findArtistByMusicbrainzId(OTHER_MBID)).toBeUndefined();
  });

  it('never matches an artist whose id is null when asked for null', async () => {
    /**
     * The dangerous degenerate case. Hand-entered artists all have a null MBID,
     * so a query that treated `null` as a value to match would return an
     * arbitrary one of them and claim it as the imported artist — silently
     * merging a stranger into a MusicBrainz identity.
     */
    await db.insert(artists).values([
      { name: 'Hand Entered', musicbrainzId: null },
      { name: 'Also Hand Entered', musicbrainzId: null },
    ]);

    expect(await findArtistByMusicbrainzId(null)).toBeUndefined();
  });

  it('treats an empty-string id as no id, even if a row holds one', async () => {
    /**
     * **The discriminating fixture.** Asserting `''` returns undefined against
     * a table where nobody holds `''` proves nothing — the query finds nothing
     * either way, and a mutation dropping the `=== ''` guard passed.
     *
     * A row with an empty-string MBID is what a bad import or a blanked form
     * field leaves behind. Without the guard, resolving `''` would match it and
     * claim an unrelated artist as the imported one.
     */
    await db.insert(artists).values({ name: 'Blank Id', musicbrainzId: '' });

    expect(await findArtistByMusicbrainzId('')).toBeUndefined();
  });
});

describe('findArtistsNamed — every artist with that name', () => {
  it('returns all of them, not an arbitrary one', async () => {
    /**
     * `findArtistByName` used `.limit(1)`, which was exact while the constraint
     * held and became "an arbitrary row of N" the moment it dropped. Callers
     * now decide what N > 1 means; the query no longer decides silently.
     */
    await db.insert(artists).values([
      { name: 'Discharge', musicbrainzId: DBEAT_MBID },
      { name: 'Discharge', musicbrainzId: OTHER_MBID },
    ]);

    expect(await findArtistsNamed('Discharge')).toHaveLength(2);
  });

  it('orders oldest first, so the same input gives the same answer', async () => {
    /**
     * An unordered `limit(1)` may return different rows across calls — the
     * planner is free to. §5.4's `existingId` would then point at a different
     * artist each time the same duplicate was submitted.
     */
    const [first] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: DBEAT_MBID })
      .returning();
    await db.insert(artists).values({ name: 'Discharge', musicbrainzId: OTHER_MBID });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const found = await findArtistsNamed('Discharge');
      expect(found[0].id, 'stable across calls').toBe(first.id);
    }
  });

  it('puts the OLDEST row first, and says so from created_at', async () => {
    /**
     * **A weaker assertion than it first appears, and stated honestly.**
     *
     * `findArtistsNamed` matches exactly, so every row it returns shares one
     * name — which means an `ORDER BY name` and no ordering at all are both
     * indistinguishable from `ORDER BY created_at` here. Two mutations proved
     * it: swapping to a name sort and removing the clause entirely BOTH pass.
     *
     * What this can honestly check is that the first row really is the earliest
     * by `created_at`, which is the property §5.4's `existingId` depends on. It
     * does not prove the ORDER BY causes it — on a two-row heap Postgres
     * returns insertion order regardless. Recorded in NOTES rather than dressed
     * up as coverage it does not provide.
     */
    const [oldest] = await db.insert(artists).values({ name: 'discharge' }).returning();
    await db.insert(artists).values({ name: 'discharge' });

    const found = await findArtistsNamed('discharge');

    expect(found).toHaveLength(2);
    expect(found[0].id).toBe(oldest.id);
    expect(
      found[0].createdAt.getTime(),
      'the first row is the earlier one',
    ).toBeLessThanOrEqual(found[1].createdAt.getTime());
  });

  it('returns an empty array when nobody has that name', async () => {
    // Empty, not undefined: the caller asks "how many" and zero is an answer.
    expect(await findArtistsNamed('Nobody')).toEqual([]);
  });

  it('matches the exact name rather than a prefix or a fuzzy match', async () => {
    /**
     * Fuzzy matching belongs to §7.7's ownership check and to search, which use
     * `similarity()` deliberately. A duplicate WARNING that fired on "Discharge
     * Bomb" would train the user to dismiss it.
     */
    await db.insert(artists).values([
      { name: 'Discharge' },
      { name: 'Discharge Bomb' },
      { name: 'Dischargexx' },
    ]);

    expect(await findArtistsNamed('Discharge')).toHaveLength(1);
  });
});
