import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/**
 * SPEC.md §9.1's two link terms — the artists worth suggesting, and how
 * strongly each is linked to the collection.
 *
 * **Two terms, never one.** §9.1 (amended by A27) scores an `artist_influences`
 * edge and a shared `artist_memberships` lineup separately, because they are
 * different kinds of claim: `strength` is a 1-5 judgement the user typed, and a
 * shared-member count is a fact imported from MusicBrainz. Merging them needs an
 * exchange rate between an opinion and a measurement that nothing in the
 * collection can supply — and it would dissolve the tribute-versus-side-project
 * distinction the step 11 import exists to expose, since in a sum four shared
 * members and one strong edge are the same number.
 *
 * This is the aggregate §8.1's retired graph computed as `shared_member`. The
 * derivation is re-written against §9.1's requirement rather than restored from
 * `graph.ts` (deleted at step 13, in git at `bfc8f08^`): that builder required
 * BOTH endpoints to be owned, because it drew edges within the collection. §9.1
 * asks the opposite question — one endpoint owned, the other not — so only the
 * `COUNT(DISTINCT person)` rule and its reasoning carry across.
 */

export type CandidateLinkTerms = {
  artistId: string;
  artistName: string;
  /** Sum of `strength` over edges to owned artists. 0 when reached only by lineup. */
  influenceWeight: number;
  /** Distinct people shared with owned artists. 0 when reached only by an edge. */
  sharedMemberWeight: number;
};

/**
 * Every artist not in the collection but reachable from one that is, with both
 * link terms.
 *
 * **The two terms are computed in separate CTEs and joined, never folded into a
 * running total.** A candidate reached by both routes carries both weights; an
 * implementation that computed them into one column, or wrote one over the
 * other on the overlap, is the field-holding-a-list failure NOTES records three
 * times — silent, because the singular case is the common one.
 *
 * **`FULL OUTER JOIN`, not inner or left.** A candidate may be reached by
 * either route alone, and an inner join would return only artists reached by
 * both — which is most of the collection's real links dropped, with no error.
 *
 * `COALESCE` to 0 rather than null: §9.1 sums these terms, and a null term is
 * "not linked this way", which is 0. Reporting absence would push the
 * distinction onto every caller.
 */
export async function linkTermsForCandidates(): Promise<CandidateLinkTerms[]> {
  const db = getDb();

  const result = await db.execute<CandidateLinkTerms>(sql`
    WITH owned AS (
      SELECT DISTINCT artist_id AS id FROM records
    ),
    /*
     * Edges in EITHER direction. §4.3's edge is directed (source influenced
     * target) and §9.1 asks only whether the candidate is linked to something
     * owned, not which way the influence runs: an artist who influenced a band
     * the user collects is as worth suggesting as one they influenced.
     */
    influence_links AS (
      SELECT
        other.id AS artist_id,
        SUM(i.strength)::int AS weight
      FROM artist_influences i
      JOIN LATERAL (
        SELECT
          CASE WHEN i.source_artist_id IN (SELECT id FROM owned)
               THEN i.target_artist_id ELSE i.source_artist_id END AS id
      ) AS other ON TRUE
      WHERE (
          i.source_artist_id IN (SELECT id FROM owned)
       OR i.target_artist_id IN (SELECT id FROM owned)
      )
        AND other.id NOT IN (SELECT id FROM owned)
      GROUP BY other.id
    ),
    /*
     * Two groups joined by the people they have in common.
     *
     * COUNT(DISTINCT person) because §4.3 identifies a membership by
     * (person, group, instrument) — one player holding both keyboards and
     * guitar in a band is two rows and one person. COUNT(*) would report a
     * single multi-instrumentalist as a two-member overlap, making a tribute
     * act look like a side project by a different mechanism.
     */
    shared_member_links AS (
      SELECT
        m2.group_artist_id AS artist_id,
        COUNT(DISTINCT m1.person_artist_id)::int AS weight
      FROM artist_memberships m1
      JOIN artist_memberships m2
        ON m1.person_artist_id = m2.person_artist_id
       AND m1.group_artist_id <> m2.group_artist_id
      WHERE m1.group_artist_id IN (SELECT id FROM owned)
        AND m2.group_artist_id NOT IN (SELECT id FROM owned)
      GROUP BY m2.group_artist_id
    )
    SELECT
      a.id::text AS "artistId",
      a.name AS "artistName",
      COALESCE(il.weight, 0) AS "influenceWeight",
      COALESCE(sml.weight, 0) AS "sharedMemberWeight"
    FROM influence_links il
    FULL OUTER JOIN shared_member_links sml ON sml.artist_id = il.artist_id
    JOIN artists a ON a.id = COALESCE(il.artist_id, sml.artist_id)
    /*
     * A27: ties break on artist name so the same collection scores the same way
     * on every call — §8.2's determinism rule, which outlived the feature it was
     * written for. a.id last makes the order total even when two artists share
     * a name, which §4.1 permits.
     */
    ORDER BY a.name, a.id
  `);

  return result.rows;
}
