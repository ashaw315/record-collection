import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists } from '@/db/schema';
import { resolveArtist } from '@/lib/musicbrainz/resolve-artist';

/**
 * SPEC.md §4.1 as amended — resolving a MusicBrainz artist onto a local row.
 *
 * **The failure mode is silent and permanent.** A wrong MBID attached to a local
 * artist means every later import matches the id that was attached in error, so
 * the mistake stops looking like a name collision and starts looking like
 * settled fact. Nothing throws; two bands' lineups simply merge.
 *
 * **So these tests are about the SECOND import, not the first.** A first import
 * against an empty table succeeds under almost any rule — matching on name,
 * matching on nothing, creating unconditionally. Only the second import, of a
 * DIFFERENT MusicBrainz artist sharing a name, can tell those apart.
 */

const db = getTestDb();

/** Two real, distinct UK groups. One name. */
const DBEAT = { mbid: '0c9bfbdc-4e64-497d-bf80-5c891e6766a3', name: 'Discharge' };
const OTHER = { mbid: 'a2ceee73-7a27-4ebf-96af-471140fb5a42', name: 'Discharge' };

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const countArtists = async () => {
  const result = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM artists`);
  return result.rows[0].n;
};

describe('the SECOND import — what resolution actually has to get right', () => {
  it('keeps two same-named MusicBrainz artists as two local rows', async () => {
    /**
     * **The test this unit exists for.** Import one Discharge, then the other.
     * Two distinct MBIDs must produce two local artists.
     *
     * A resolver matching on name would return the first row for the second
     * import, attach the second band's MBID to it — or worse, leave the first
     * band's MBID in place and hang the second band's lineup off it — and
     * nothing would error.
     */
    const first = await resolveArtist(DBEAT);
    const second = await resolveArtist(OTHER);

    expect(first.artistId, 'two distinct local artists').not.toBe(second.artistId);
    expect(await countArtists()).toBe(2);

    const rows = await db.execute<{ id: string; musicbrainz_id: string }>(
      sql`SELECT id, musicbrainz_id FROM artists ORDER BY created_at`,
    );
    expect(rows.rows.map((r) => r.musicbrainz_id).sort()).toEqual(
      [DBEAT.mbid, OTHER.mbid].sort(),
    );
  });

  it('re-importing the SAME artist reuses the row rather than adding one', async () => {
    // The other half: same MBID must never create a second row. Between them
    // these two tests pin the identity rule from both sides.
    const first = await resolveArtist(DBEAT);
    const again = await resolveArtist(DBEAT);

    expect(again.artistId).toBe(first.artistId);
    expect(await countArtists()).toBe(1);
  });

  it('matches on the MBID even when the name has changed since import', async () => {
    /**
     * MusicBrainz artists get renamed, and the user may edit a local name too.
     * The id is the identity; the name is a label on it. A resolver that
     * matched names would create a duplicate here.
     */
    const first = await resolveArtist(DBEAT);
    await db.execute(sql`UPDATE artists SET name = 'Discharge (UK)' WHERE id = ${first.artistId}`);

    const again = await resolveArtist(DBEAT);

    expect(again.artistId).toBe(first.artistId);
    expect(await countArtists()).toBe(1);
  });
});

describe('a local artist with no MBID — the ambiguous case', () => {
  /**
   * §4.1: create the artist, RECORD the possible match, and let a later review
   * settle it. Adam's collection is hand-entered, so a name matching an
   * MBID-less local row is the common case on a first import, not an edge.
   *
   * Attaching the MBID to that row would be the silent-and-permanent failure:
   * it might be the same artist, and it might be a different band with the same
   * name, and nothing in the data says which.
   */

  it('does NOT claim a hand-entered artist by name', async () => {
    const [handEntered] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: null })
      .returning();

    const resolved = await resolveArtist(DBEAT);

    expect(resolved.artistId, 'a new row, not the existing one').not.toBe(handEntered.id);
    expect(await countArtists()).toBe(2);

    const untouched = await db.execute<{ musicbrainz_id: string | null }>(
      sql`SELECT musicbrainz_id FROM artists WHERE id = ${handEntered.id}`,
    );
    expect(
      untouched.rows[0].musicbrainz_id,
      'the hand-entered row keeps its null id',
    ).toBeNull();
  });

  it('reports the possible match so a later review can settle it', async () => {
    /**
     * The resolver REPORTS rather than persists — unit 5 owns the candidates
     * table and the /manage review. Returned rather than asked mid-walk,
     * because a first import would otherwise stop for confirmation thirty
     * times.
     */
    const [handEntered] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: null })
      .returning();

    const resolved = await resolveArtist(DBEAT);

    expect(resolved.candidateIds, 'the row it might be').toEqual([handEntered.id]);
  });

  it('reports EVERY MBID-less row with that name, not just one', async () => {
    /**
     * A name can match two hand-entered rows, and a single candidate would
     * silently drop one — the same shape as the version-table badge bug, where
     * one field could hold what was really a list.
     */
    const [a] = await db.insert(artists).values({ name: 'Discharge' }).returning();
    const [b] = await db.insert(artists).values({ name: 'Discharge' }).returning();

    const resolved = await resolveArtist(DBEAT);

    expect(resolved.candidateIds.sort()).toEqual([a.id, b.id].sort());
  });

  it('does not report a row that already has a DIFFERENT MBID', async () => {
    /**
     * **Not a candidate — a known different artist.** The other Discharge
     * carries its own id, so MusicBrainz has already answered the question a
     * review would ask. Offering it for merge would invite the exact mistake
     * this unit prevents.
     */
    await db.insert(artists).values({ name: 'Discharge', musicbrainzId: OTHER.mbid });

    const resolved = await resolveArtist(DBEAT);

    expect(resolved.candidateIds, 'MusicBrainz says these are different').toEqual([]);
    expect(await countArtists()).toBe(2);
  });

  it('reports no candidates when the MBID already matched', async () => {
    // Nothing to review: the identity key answered. A candidate here would ask
    // the user to confirm something already known.
    const [existing] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: DBEAT.mbid })
      .returning();
    await db.insert(artists).values({ name: 'Discharge', musicbrainzId: null });

    const resolved = await resolveArtist(DBEAT);

    expect(resolved.artistId).toBe(existing.id);
    expect(resolved.candidateIds).toEqual([]);
  });
});

describe('creating the artist', () => {
  it('stores the MusicBrainz id, so the next import matches on it', async () => {
    /**
     * The whole point of writing it: without the id stored, every subsequent
     * import falls back to name matching and the ambiguity recurs for ever.
     */
    const resolved = await resolveArtist(DBEAT);

    const row = await db.execute<{ musicbrainz_id: string; name: string }>(
      sql`SELECT musicbrainz_id, name FROM artists WHERE id = ${resolved.artistId}`,
    );
    expect(row.rows[0].musicbrainz_id).toBe(DBEAT.mbid);
    expect(row.rows[0].name).toBe('Discharge');
  });

  it('says whether it created the artist or found it', async () => {
    // The import needs to report what it did, and "imported 12 artists" is a
    // different statement from "found 12 artists you already had".
    const first = await resolveArtist(DBEAT);
    const second = await resolveArtist(DBEAT);

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
  });

  it('refuses an artist with no MusicBrainz id rather than creating a nameless key', async () => {
    /**
     * Every hand-entered artist has a null MBID. Creating a row with a null id
     * from an import would make it indistinguishable from those, and the next
     * import would find it by name and face the same ambiguity — a resolver
     * generating its own future ambiguity.
     */
    await expect(resolveArtist({ mbid: '', name: 'Nameless' })).rejects.toThrow();
  });
});
