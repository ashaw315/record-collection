import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/**
 * Merging two artists the user has confirmed are one (SPEC.md §4.3).
 *
 * **Transactional because it is irreversible.** Nine foreign keys point at
 * `artists` and four of them CASCADE — `artist_genres`, `artist_influences`,
 * `artist_memberships`, `artist_match_candidates`. Deleting the losing row
 * destroys all four silently, so everything must move BEFORE the delete and the
 * whole sequence must be one transaction. A merge that moved records and then
 * failed would leave the collection split across two artists; a merge that
 * deleted first would lose the rest outright. Neither raises anything a user
 * would see, which is the acquire-flow shape.
 *
 * **Every junction has a composite key, so every move can collide.** If both
 * artists are tagged "punk", moving the loser's `artist_genres` row violates
 * `(artist_id, genre_id)`. Each move is therefore an upsert-and-discard rather
 * than a plain UPDATE, and the discarded count is reported so the confirmation
 * can name it.
 */

/**
 * Whether a loser membership row (`lm`) would land on one the survivor already
 * holds, once its id is rewritten.
 *
 * **`IS NOT DISTINCT FROM` on the instrument, not `=`.** The constraint is
 * `UNIQUE NULLS NOT DISTINCT` (§4.3), so two null instruments DO collide — and
 * `null = null` is null, which a WHERE clause reads as false. Using `=` here
 * would miss exactly the case §4.3 calls load-bearing, and the merge would fail
 * on a duplicate the plan had promised was safe.
 *
 * Both directions are covered because the loser may be the person or the group.
 */
function membershipCollides(survivorId: string, loserId: string) {
  return sql`EXISTS (
    SELECT 1 FROM artist_memberships sm
    WHERE sm.person_artist_id = CASE WHEN lm.person_artist_id = ${loserId}
                                     THEN ${survivorId} ELSE lm.person_artist_id END
      AND sm.group_artist_id  = CASE WHEN lm.group_artist_id = ${loserId}
                                     THEN ${survivorId} ELSE lm.group_artist_id END
      AND sm.instrument IS NOT DISTINCT FROM lm.instrument
  )`;
}

/** The same question for `artist_influences`, keyed `(source, target)`. */
function influenceCollides(survivorId: string, loserId: string) {
  return sql`EXISTS (
    SELECT 1 FROM artist_influences si
    WHERE si.source_artist_id = CASE WHEN li.source_artist_id = ${loserId}
                                     THEN ${survivorId} ELSE li.source_artist_id END
      AND si.target_artist_id = CASE WHEN li.target_artist_id = ${loserId}
                                     THEN ${survivorId} ELSE li.target_artist_id END
  )`;
}

/**
 * A merge refused by a RULE, as distinct from one that failed.
 *
 * The endpoint answers `409 MERGE_REFUSED` and puts `message` in front of the
 * user, so the two must not be conflated: a §4.3 refusal is a sentence the user
 * should read, and a constraint violation is a fault whose text is a SQL dump.
 * Before this existed the endpoint caught everything and presented
 * `Failed query: INSERT INTO artist_memberships ...` as though it were a
 * considered answer.
 */
export class MergeRefused extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MergeRefused';
  }
}

export type MergeInput = {
  survivorId: string;
  loserId: string;
  /**
   * Test seam: called inside the transaction, after the moves and before the
   * loser is deleted.
   *
   * Exposed deliberately. The endpoint validates both artists before calling
   * this, so an endpoint-level test cannot reach a mid-transaction failure —
   * the pre-checks mask the code under test, which has happened in this project
   * before. Schema-level injections were tried first and each was contrived
   * enough that the test described a mechanism the code did not implement.
   */
  afterMoves?: () => void | Promise<void>;
};

export type MergePlan = {
  moves: {
    records: number;
    wantList: number;
    genres: number;
    memberships: number;
    influences: number;
  };
  discards: {
    /** Tags the survivor already carries — moving them would collide. */
    duplicateGenres: number;
    /**
     * Lineup rows the survivor already carries for the same (group, instrument)
     * — or the same (person, instrument) when the loser is the group.
     */
    duplicateMemberships: number;
    /** Influence edges the survivor already has with the same counterpart. */
    duplicateInfluences: number;
    /** Edges between the two artists, which stop being statements. */
    selfEdges: number;
  };
  /** Always true, and stated rather than implied: merging destroys a row. */
  irreversible: boolean;
};

/**
 * What a merge would do, for a confirmation that names it.
 *
 * The delete confirmation names what is lost; this must too. "3 genre tags will
 * be discarded because they duplicate the survivor's" is the difference between
 * an informed merge and a surprise — and unlike "distinct", which is a recorded
 * opinion that can be revisited, this cannot be undone.
 */
export async function planMerge(survivorId: string, loserId: string): Promise<MergePlan> {
  const db = getDb();

  const [row] = (
    await db.execute<{
      records: number;
      want_list: number;
      genres: number;
      memberships: number;
      influences: number;
      duplicate_genres: number;
      duplicate_memberships: number;
      duplicate_influences: number;
      self_edges: number;
    }>(sql`
      SELECT
        (SELECT COUNT(*)::int FROM records WHERE artist_id = ${loserId}) AS records,
        (SELECT COUNT(*)::int FROM want_list WHERE artist_id = ${loserId}) AS want_list,
        (SELECT COUNT(*)::int FROM artist_genres lg
           WHERE lg.artist_id = ${loserId}
             AND NOT EXISTS (SELECT 1 FROM artist_genres sg
                              WHERE sg.artist_id = ${survivorId}
                                AND sg.genre_id = lg.genre_id)) AS genres,
        (SELECT COUNT(*)::int FROM artist_memberships lm
           WHERE (lm.person_artist_id = ${loserId} OR lm.group_artist_id = ${loserId})
             AND lm.person_artist_id <> ${survivorId}
             AND lm.group_artist_id <> ${survivorId}
             AND NOT ${membershipCollides(survivorId, loserId)}) AS memberships,
        (SELECT COUNT(*)::int FROM artist_influences li
           WHERE (li.source_artist_id = ${loserId} OR li.target_artist_id = ${loserId})
             AND li.source_artist_id <> ${survivorId}
             AND li.target_artist_id <> ${survivorId}
             AND NOT ${influenceCollides(survivorId, loserId)}) AS influences,
        (SELECT COUNT(*)::int FROM artist_memberships lm
           WHERE (lm.person_artist_id = ${loserId} OR lm.group_artist_id = ${loserId})
             AND lm.person_artist_id <> ${survivorId}
             AND lm.group_artist_id <> ${survivorId}
             AND ${membershipCollides(survivorId, loserId)}) AS duplicate_memberships,
        (SELECT COUNT(*)::int FROM artist_influences li
           WHERE (li.source_artist_id = ${loserId} OR li.target_artist_id = ${loserId})
             AND li.source_artist_id <> ${survivorId}
             AND li.target_artist_id <> ${survivorId}
             AND ${influenceCollides(survivorId, loserId)}) AS duplicate_influences,
        (SELECT COUNT(*)::int FROM artist_genres lg
           WHERE lg.artist_id = ${loserId}
             AND EXISTS (SELECT 1 FROM artist_genres sg
                          WHERE sg.artist_id = ${survivorId}
                            AND sg.genre_id = lg.genre_id)) AS duplicate_genres,
        (SELECT COUNT(*)::int FROM artist_influences
           WHERE (source_artist_id = ${loserId} AND target_artist_id = ${survivorId})
              OR (source_artist_id = ${survivorId} AND target_artist_id = ${loserId}))
          + (SELECT COUNT(*)::int FROM artist_memberships
               WHERE (person_artist_id = ${loserId} AND group_artist_id = ${survivorId})
                  OR (person_artist_id = ${survivorId} AND group_artist_id = ${loserId}))
          AS self_edges
    `)
  ).rows;

  return {
    moves: {
      records: Number(row.records),
      wantList: Number(row.want_list),
      genres: Number(row.genres),
      memberships: Number(row.memberships),
      influences: Number(row.influences),
    },
    discards: {
      duplicateGenres: Number(row.duplicate_genres),
      duplicateMemberships: Number(row.duplicate_memberships),
      duplicateInfluences: Number(row.duplicate_influences),
      selfEdges: Number(row.self_edges),
    },
    irreversible: true,
  };
}

export async function mergeArtists(input: MergeInput): Promise<void> {
  const { survivorId, loserId } = input;

  if (survivorId === loserId) {
    throw new MergeRefused('Cannot merge an artist into itself.');
  }

  const db = getDb();

  await db.transaction(async (tx) => {
    const [pair] = (
      await tx.execute<{ survivor_mbid: string | null; loser_mbid: string | null }>(sql`
        SELECT
          (SELECT musicbrainz_id FROM artists WHERE id = ${survivorId}) AS survivor_mbid,
          (SELECT musicbrainz_id FROM artists WHERE id = ${loserId}) AS loser_mbid
      `)
    ).rows;

    /**
     * **§4.3, enforced here and not only at the endpoint.** A name matching a
     * row with a DIFFERENT MusicBrainz id means a different artist — that is
     * what the resolver enforces on import, and the review must not be able to
     * override it through another door. A safeguard that depends on which route
     * the user took is not a safeguard.
     */
    if (pair.survivor_mbid !== null && pair.loser_mbid !== null) {
      throw new MergeRefused(
        'These artists have different MusicBrainz ids, which means MusicBrainz ' +
          'has them as different artists. They cannot be merged.',
      );
    }

    // Plain reassignment: `records.artist_id` and `want_list.artist_id` carry no
    // uniqueness, so nothing collides.
    await tx.execute(sql`UPDATE records SET artist_id = ${survivorId} WHERE artist_id = ${loserId}`);
    await tx.execute(
      sql`UPDATE want_list SET artist_id = ${survivorId} WHERE artist_id = ${loserId}`,
    );

    /**
     * Genres: move what the survivor lacks, then drop the rest. A plain UPDATE
     * would violate `(artist_id, genre_id)` when both artists share a tag and
     * fail the whole merge over a duplicate that means nothing.
     *
     * This is the table §4.3's own list omitted, and the one that would hurt
     * most: it cascades, so a merge that skipped it would strip UK82 from a
     * band silently — §8's genre-flattening realised by accident.
     */
    await tx.execute(sql`
      INSERT INTO artist_genres (artist_id, genre_id)
      SELECT ${survivorId}, genre_id FROM artist_genres WHERE artist_id = ${loserId}
      ON CONFLICT DO NOTHING
    `);
    await tx.execute(sql`DELETE FROM artist_genres WHERE artist_id = ${loserId}`);

    /**
     * Memberships and influences: edges BETWEEN the two are deleted, not moved.
     *
     * "A influenced B" stops being a statement when A and B turn out to be one
     * artist — it is not a fact about the survivor. Both tables also CHECK
     * against self-reference, so moving such a row would fail the constraint
     * even if the meaning were acceptable.
     */
    await tx.execute(sql`
      DELETE FROM artist_memberships
      WHERE (person_artist_id = ${loserId} AND group_artist_id = ${survivorId})
         OR (person_artist_id = ${survivorId} AND group_artist_id = ${loserId})
    `);
    /**
     * **Insert-on-conflict-then-delete, exactly as the genres above.** A plain
     * UPDATE violates `UNIQUE NULLS NOT DISTINCT (person, group, instrument)`
     * whenever both artists hold the same lineup row — which is the ordinary
     * case for the duplicates this merge exists to resolve, not an edge. It was
     * measured: `artist_memberships_person_group_instrument_key`, with the whole
     * transaction rolled back and the artists left split.
     *
     * Both columns are rewritten in ONE statement rather than two. The loser can
     * be the person or the group, and a row where it is both has already been
     * deleted above as a self-edge — so a single CASE per column covers every
     * surviving row and cannot collide with its own intermediate state, which
     * two sequential UPDATEs could.
     */
    await tx.execute(sql`
      INSERT INTO artist_memberships
        (person_artist_id, group_artist_id, instrument, began_year, ended_year, musicbrainz_id)
      SELECT
        CASE WHEN person_artist_id = ${loserId} THEN ${survivorId} ELSE person_artist_id END,
        CASE WHEN group_artist_id  = ${loserId} THEN ${survivorId} ELSE group_artist_id  END,
        instrument, began_year, ended_year, musicbrainz_id
      FROM artist_memberships
      WHERE person_artist_id = ${loserId} OR group_artist_id = ${loserId}
      ON CONFLICT DO NOTHING
    `);
    await tx.execute(sql`
      DELETE FROM artist_memberships
      WHERE person_artist_id = ${loserId} OR group_artist_id = ${loserId}
    `);

    await tx.execute(sql`
      DELETE FROM artist_influences
      WHERE (source_artist_id = ${loserId} AND target_artist_id = ${survivorId})
         OR (source_artist_id = ${survivorId} AND target_artist_id = ${loserId})
    `);
    /**
     * The same treatment, for the same reason: PK `(source, target)` collides
     * when both artists share a counterpart. Measured:
     * `artist_influences_source_artist_id_target_artist_id_pk`.
     *
     * **`DO NOTHING`, so the SURVIVOR's row wins.** `strength` is a 1–5 judgement
     * the user entered on the row they chose to keep; taking the loser's would
     * overwrite a curated value with one arriving from elsewhere, which §8
     * forbids. The discarded count is reported so the confirmation can say a
     * duplicate edge was dropped rather than leaving it silent.
     */
    await tx.execute(sql`
      INSERT INTO artist_influences (source_artist_id, target_artist_id, strength, notes)
      SELECT
        CASE WHEN source_artist_id = ${loserId} THEN ${survivorId} ELSE source_artist_id END,
        CASE WHEN target_artist_id = ${loserId} THEN ${survivorId} ELSE target_artist_id END,
        strength, notes
      FROM artist_influences
      WHERE source_artist_id = ${loserId} OR target_artist_id = ${loserId}
      ON CONFLICT DO NOTHING
    `);
    await tx.execute(sql`
      DELETE FROM artist_influences
      WHERE source_artist_id = ${loserId} OR target_artist_id = ${loserId}
    `);

    /**
     * The pair that prompted this merge must not survive as an open question
     * about an artist that no longer exists. Deleted rather than resolved: the
     * cascade would take them anyway, and an answered candidate naming a
     * deleted row tells the next reader nothing.
     */
    await tx.execute(sql`
      DELETE FROM artist_match_candidates
      WHERE artist_id = ${loserId} OR candidate_artist_id = ${loserId}
    `);

    /**
     * Scalars fill GAPS ONLY (§8: never overwrite what the user entered). The
     * survivor is the row the user has curated, so its values win wherever it
     * has one — and the MusicBrainz id moves across, which is what makes the
     * survivor rule work: an MBID is a column, a record graph is not.
     */
    /**
     * **Read the loser's scalars, then release its unique ids, then copy.**
     *
     * `musicbrainz_id` and `discogs_artist_id` both carry partial unique
     * indexes, so writing one onto the survivor while the loser still holds it
     * puts the value on two rows at once and violates the index — even though
     * the loser is deleted moments later. Measured: `duplicate key value
     * violates unique constraint "artists_musicbrainz_id_key"`.
     */
    const [donor] = (
      await tx.execute<{
        musicbrainz_id: string | null;
        discogs_artist_id: number | null;
        formed_year: number | null;
        origin_country: string | null;
        notes: string | null;
      }>(sql`
        SELECT musicbrainz_id, discogs_artist_id, formed_year, origin_country, notes
        FROM artists WHERE id = ${loserId}
      `)
    ).rows;

    await tx.execute(
      sql`UPDATE artists SET musicbrainz_id = NULL, discogs_artist_id = NULL WHERE id = ${loserId}`,
    );

    /**
     * Gaps only (§8: never overwrite what the user entered). The survivor is
     * the row the user curated, so its values win wherever it has one — and the
     * MusicBrainz id moves across, which is what makes the survivor rule work:
     * an MBID is a column, a record graph is not.
     */
    await tx.execute(sql`
      UPDATE artists SET
        musicbrainz_id = COALESCE(musicbrainz_id, ${donor.musicbrainz_id}),
        discogs_artist_id = COALESCE(discogs_artist_id, ${donor.discogs_artist_id}),
        formed_year = COALESCE(formed_year, ${donor.formed_year}),
        origin_country = COALESCE(origin_country, ${donor.origin_country}),
        notes = COALESCE(notes, ${donor.notes})
      WHERE id = ${survivorId}
    `);

    if (input.afterMoves !== undefined) await input.afterMoves();

    await tx.execute(sql`DELETE FROM artists WHERE id = ${loserId}`);
  });
}
