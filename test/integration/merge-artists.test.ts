import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, genres, records } from '@/db/schema';
import { mergeArtists, planMerge } from '@/lib/db/queries/merge-artists';

/**
 * Merging two artists the user has confirmed are one (SPEC.md §4.3).
 *
 * **Irreversible, and transactional for that reason.** Nine foreign keys point
 * at `artists`, and four of them CASCADE — so deleting the losing row destroys
 * its genres, influences, memberships and match candidates with no error at
 * all. A merge that moved records but failed before the genres would leave the
 * data split across two artists, and a merge that deleted before moving would
 * lose them outright. Neither raises anything a user would see.
 *
 * That is the acquire-flow shape, and the test that matters is the one that
 * forces a failure PARTWAY.
 */

const db = getTestDb();

const DBEAT = '0c9bfbdc-4e64-497d-bf80-5c891e6766a3';
const OTHER = 'a2ceee73-7a27-4ebf-96af-471140fb5a42';

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const count = async (table: string, where = sql`TRUE`) => {
  const result = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)} WHERE ${where}`,
  );
  return result.rows[0].n;
};

/** The survivor has the records; the loser has the MusicBrainz id. */
async function twoArtists() {
  const [keeper] = await db
    .insert(artists)
    .values({ name: 'Discharge', formedYear: 1977 })
    .returning();
  const [loser] = await db
    .insert(artists)
    .values({ name: 'Discharge', musicbrainzId: DBEAT, originCountry: 'GB' })
    .returning();

  return { keeper, loser };
}

describe('the transaction — all or nothing', () => {
  it('writes NOTHING when the merge fails partway', async () => {
    /**
     * **The load-bearing test of this unit, and it is written against the
     * query-layer primitive deliberately.** The endpoint validates both artists
     * before calling this, so a test driving the endpoint cannot reach a
     * mid-transaction failure — the pre-checks mask exactly the code under
     * test. That masking has happened here before.
     *
     * **The failure is injected INSIDE the transaction**, via a seam the
     * primitive exposes for exactly this. Three schema-level injections were
     * tried first and each was contrived — an out-of-range year the seed itself
     * could not write, a null byte the tooling rejected, a want-list overflow
     * that needed a swallowed catch. Each attempt produced a test whose comment
     * described a mechanism the code did not implement, which is the decorative
     * test this project has shipped before.
     *
     * A seam is honest: it fails where a real error would (after records and
     * genres have moved, before the loser is deleted) and the assertions below
     * are about the ROLLBACK, which is the behaviour under test.
     */
    const { keeper, loser } = await twoArtists();

    await db.insert(records).values([
      { title: 'Hear Nothing', artistId: keeper.id },
      { title: 'Why', artistId: loser.id },
    ]);
    const [genre] = await db.insert(genres).values({ name: 'UK82' }).returning();
    await db.execute(
      sql`INSERT INTO artist_genres (artist_id, genre_id) VALUES (${loser.id}, ${genre.id})`,
    );

    await expect(
      mergeArtists({
        survivorId: keeper.id,
        loserId: loser.id,
        afterMoves: () => {
          throw new Error('injected failure, mid-merge');
        },
      }),
    ).rejects.toThrow(/injected failure/);

    // Every one of these would be wrong on its own; together they say the
    // transaction held.
    expect(await count('artists'), 'the loser was not deleted').toBe(2);
    expect(
      await count('records', sql`artist_id = ${loser.id}`),
      'its record did not move',
    ).toBe(1);
    expect(
      await count('artist_genres', sql`artist_id = ${loser.id}`),
      'nor its genre link',
    ).toBe(1);
    expect(
      await count('artist_genres', sql`artist_id = ${keeper.id}`),
      'and none arrived on the survivor',
    ).toBe(0);
  });
});

describe('what moves', () => {
  it('moves records to the survivor', async () => {
    const { keeper, loser } = await twoArtists();
    await db.insert(records).values({ title: 'Why', artistId: loser.id });

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    expect(await count('records', sql`artist_id = ${keeper.id}`)).toBe(1);
    expect(await count('artists')).toBe(1);
  });

  it('moves GENRE tags, which cascade and would otherwise vanish', async () => {
    /**
     * `artist_genres` cascades on delete, so deleting the loser destroys its
     * genre links silently — a merged band quietly losing "UK82" is §8's
     * genre-flattening realised by accident, with no error and no trace.
     */
    const { keeper, loser } = await twoArtists();
    const [uk82] = await db.insert(genres).values({ name: 'UK82' }).returning();
    await db.execute(
      sql`INSERT INTO artist_genres (artist_id, genre_id) VALUES (${loser.id}, ${uk82.id})`,
    );

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    expect(await count('artist_genres', sql`artist_id = ${keeper.id}`)).toBe(1);
  });

  it('moves want-list entries, memberships and influences', async () => {
    const { keeper, loser } = await twoArtists();
    const [third] = await db.insert(artists).values({ name: 'Broken Bones' }).returning();

    await db.execute(
      sql`INSERT INTO want_list (title, artist_id) VALUES ('Never Again', ${loser.id})`,
    );
    await db.execute(
      sql`INSERT INTO artist_memberships (person_artist_id, group_artist_id)
          VALUES (${third.id}, ${loser.id})`,
    );
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id)
          VALUES (${loser.id}, ${third.id})`,
    );

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    expect(await count('want_list', sql`artist_id = ${keeper.id}`)).toBe(1);
    expect(await count('artist_memberships', sql`group_artist_id = ${keeper.id}`)).toBe(1);
    expect(await count('artist_influences', sql`source_artist_id = ${keeper.id}`)).toBe(1);
  });
});

describe('what is DISCARDED rather than moved', () => {
  it('drops a duplicate genre tag instead of failing on the composite key', async () => {
    /**
     * `artist_genres` is keyed `(artist_id, genre_id)`. If both artists are
     * tagged UK82, moving the loser's row collides — a naive UPDATE throws a
     * unique violation and the whole merge fails on a duplicate that means
     * nothing.
     */
    const { keeper, loser } = await twoArtists();
    const [uk82] = await db.insert(genres).values({ name: 'UK82' }).returning();
    await db.execute(sql`
      INSERT INTO artist_genres (artist_id, genre_id)
      VALUES (${keeper.id}, ${uk82.id}), (${loser.id}, ${uk82.id})
    `);

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    expect(await count('artist_genres'), 'one tag, not two and not an error').toBe(1);
  });

  it('deletes an influence edge BETWEEN the two rather than making a self-edge', async () => {
    /**
     * "A influenced B" stops being a statement when A and B turn out to be one
     * artist — it is not a fact about the survivor. `artist_influences` has a
     * CHECK forbidding self-edges, so moving it would fail the constraint even
     * if the meaning were acceptable.
     */
    const { keeper, loser } = await twoArtists();
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id)
          VALUES (${loser.id}, ${keeper.id})`,
    );

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    expect(await count('artist_influences')).toBe(0);
  });

  it('deletes a membership between the two for the same reason', async () => {
    const { keeper, loser } = await twoArtists();
    await db.execute(
      sql`INSERT INTO artist_memberships (person_artist_id, group_artist_id)
          VALUES (${loser.id}, ${keeper.id})`,
    );

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    expect(await count('artist_memberships')).toBe(0);
  });

  it('closes the match candidates between the two', async () => {
    // The pair that prompted the merge must not survive as an open question
    // about an artist that no longer exists.
    const { keeper, loser } = await twoArtists();
    await db.execute(
      sql`INSERT INTO artist_match_candidates (artist_id, candidate_artist_id, reason)
          VALUES (${loser.id}, ${keeper.id}, 'name_match_no_mbid')`,
    );

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    expect(await count('artist_match_candidates')).toBe(0);
  });
});

describe('the surviving row', () => {
  it('takes the MusicBrainz id when it has none', async () => {
    /**
     * The survivor rule's whole point: an MBID is a COLUMN and a record graph
     * is not. The row with eleven records survives, and the identity moves onto
     * it — nothing is lost.
     */
    const { keeper, loser } = await twoArtists();

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    const row = await db.execute<{ musicbrainz_id: string }>(
      sql`SELECT musicbrainz_id FROM artists WHERE id = ${keeper.id}`,
    );
    expect(row.rows[0].musicbrainz_id).toBe(DBEAT);
  });

  it('fills empty fields only, never overwriting what the user curated', async () => {
    /**
     * §8: never overwrite user-entered data. The survivor is the row the user
     * has been living with, so its values win wherever it has one.
     */
    const [keeper] = await db
      .insert(artists)
      .values({ name: 'Discharge', originCountry: 'UK', notes: 'mine' })
      .returning();
    const [loser] = await db
      .insert(artists)
      .values({
        name: 'Discharge',
        musicbrainzId: DBEAT,
        originCountry: 'GB',
        notes: 'imported',
        formedYear: 1977,
      })
      .returning();

    await mergeArtists({ survivorId: keeper.id, loserId: loser.id });

    const row = await db.execute<{
      origin_country: string;
      notes: string;
      formed_year: number;
    }>(sql`SELECT origin_country, notes, formed_year FROM artists WHERE id = ${keeper.id}`);

    expect(row.rows[0].origin_country, 'not overwritten').toBe('UK');
    expect(row.rows[0].notes, 'nor these').toBe('mine');
    expect(row.rows[0].formed_year, 'but the gap is filled').toBe(1977);
  });
});

describe('merges that must be refused', () => {
  it('refuses when BOTH artists have a MusicBrainz id', async () => {
    /**
     * §4.3: a name matching a row with a DIFFERENT MBID means a different
     * artist. The resolver enforces that, and the review must not be able to
     * override it through another door — a safeguard that depends on which
     * route the user took is not a safeguard.
     */
    const [keeper] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: DBEAT })
      .returning();
    const [loser] = await db
      .insert(artists)
      .values({ name: 'Discharge', musicbrainzId: OTHER })
      .returning();

    await expect(
      mergeArtists({ survivorId: keeper.id, loserId: loser.id }),
    ).rejects.toThrow(/MusicBrainz/i);

    expect(await count('artists'), 'both survive').toBe(2);
  });

  it('refuses to merge an artist into itself', async () => {
    const { keeper } = await twoArtists();

    await expect(
      mergeArtists({ survivorId: keeper.id, loserId: keeper.id }),
    ).rejects.toThrow();
  });
});

describe('planMerge — what the confirmation must say', () => {
  /**
   * The delete confirmation names what is lost; this must too. "3 genre tags
   * will be discarded because they duplicate the survivor's" is the difference
   * between an informed merge and a surprise — and merging is irreversible.
   */

  it('counts what moves', async () => {
    const { keeper, loser } = await twoArtists();
    await db.insert(records).values([
      { title: 'Why', artistId: loser.id },
      { title: 'Realities of War', artistId: loser.id },
    ]);
    const [uk82] = await db.insert(genres).values({ name: 'UK82' }).returning();
    await db.execute(
      sql`INSERT INTO artist_genres (artist_id, genre_id) VALUES (${loser.id}, ${uk82.id})`,
    );

    const plan = await planMerge(keeper.id, loser.id);

    expect(plan.moves.records).toBe(2);
    expect(plan.moves.genres).toBe(1);
  });

  it('counts what is DISCARDED, separately from what moves', async () => {
    const { keeper, loser } = await twoArtists();
    const [uk82] = await db.insert(genres).values({ name: 'UK82' }).returning();
    await db.execute(sql`
      INSERT INTO artist_genres (artist_id, genre_id)
      VALUES (${keeper.id}, ${uk82.id}), (${loser.id}, ${uk82.id})
    `);
    await db.execute(
      sql`INSERT INTO artist_influences (source_artist_id, target_artist_id)
          VALUES (${loser.id}, ${keeper.id})`,
    );

    const plan = await planMerge(keeper.id, loser.id);

    expect(plan.discards.duplicateGenres, 'duplicates the survivor already has').toBe(1);
    expect(plan.discards.selfEdges, 'stops being a statement').toBe(1);
    expect(plan.moves.genres, 'and it is not double-counted as a move').toBe(0);
  });

  it('says the merge cannot be undone', async () => {
    const { keeper, loser } = await twoArtists();

    const plan = await planMerge(keeper.id, loser.id);

    expect(plan.irreversible).toBe(true);
  });
});
