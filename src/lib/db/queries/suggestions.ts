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
  /** How many owned artists those edges reach. §9.1's "linked to N artists you own". */
  influenceArtistCount: number;
  /** Distinct people shared with owned artists. 0 when reached only by an edge. */
  sharedMemberWeight: number;
  /** How many owned bands share those people. */
  sharedMemberArtistCount: number;
  /** One owned band to name in the reason string; null when reached only by an edge. */
  sharedMemberExemplar: string | null;
  /** An UNACQUIRED want-list row exists for this artist (§7.3). */
  onWantList: boolean;
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
        SUM(i.strength)::int AS weight,
        /*
         * COUNT(DISTINCT owned artist), not COUNT(*): §9.1's reason string says
         * "Linked to 3 artists you own", which is a count of ARTISTS. Two edges
         * to one owned artist is one artist. A fixture with one linking artist
         * per candidate cannot tell this from a boolean, so the multi-source
         * case in the tests is what constrains it.
         */
        COUNT(DISTINCT CASE WHEN i.source_artist_id IN (SELECT id FROM owned)
                            THEN i.source_artist_id ELSE i.target_artist_id END)::int
          AS artist_count
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
        COUNT(DISTINCT m1.person_artist_id)::int AS weight,
        COUNT(DISTINCT m1.group_artist_id)::int AS artist_count,
        /*
         * One owned band to NAME in the reason string ("shares 4 members with
         * Discharge"). MIN by name rather than an arbitrary row, so the sentence
         * is stable across calls — §8.2's determinism rule reaching the copy.
         *
         * A single name where several bands may share members is a deliberate
         * narrowing of the SENTENCE, not of the data: artist_count carries how
         * many, so nothing is silently dropped the way a scalar standing in for
         * a list would.
         */
        MIN(oa.name) AS exemplar_name
      FROM artist_memberships m1
      JOIN artists oa ON oa.id = m1.group_artist_id
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
      COALESCE(il.artist_count, 0) AS "influenceArtistCount",
      COALESCE(sml.weight, 0) AS "sharedMemberWeight",
      COALESCE(sml.artist_count, 0) AS "sharedMemberArtistCount",
      sml.exemplar_name AS "sharedMemberExemplar",
      EXISTS (
        SELECT 1 FROM want_list wl
         WHERE wl.artist_id = a.id
           AND wl.is_acquired = false
      ) AS "onWantList"
    FROM influence_links il
    FULL OUTER JOIN shared_member_links sml ON sml.artist_id = il.artist_id
    JOIN artists a ON a.id = COALESCE(il.artist_id, sml.artist_id)
    /*
     * **A48: a band MusicBrainz says derives from one the user OWNS is not a
     * suggestion, and is dropped rather than scored down.**
     *
     * The asymmetry with the want-list suppression below is deliberate. A
     * want-listed candidate is a REAL suggestion already acted on, so it keeps
     * its row and loses 3.0. A tribute act is not a weak suggestion — it is the
     * band the user already owns under another name, and there is no score at
     * which "you own Dire Straits, consider The Dire Straits Experience" becomes
     * useful. Subtracting a constant would put it on a scale it does not sit on.
     *
     * **The ORIGIN must be owned.** A tribute to a band the user has never heard
     * of says nothing about their collection, and dropping it would discard a
     * legitimate suggestion for an unrelated reason.
     *
     * **Only the DERIVED side is excluded.** Matching either column would hide
     * an unowned ORIGINAL because it happens to have a tribute act — the
     * direction error normalizeDerivedActs guards one layer down, repeated
     * here because this is where it would actually bite.
     *
     * **PARTIAL by measurement: 2 of 6 in Adam's collection** (§9.1). The other
     * four carry no such relation and are unreachable by any graph-derived
     * signal. A test naming this as a floor sits beside the ones that pin it.
     */
    WHERE NOT EXISTS (
      SELECT 1 FROM artist_derived_acts d
       WHERE d.derived_artist_id = a.id
         AND d.origin_artist_id IN (SELECT id FROM owned)
    )
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

/**
 * §9.1's coefficients. Named rather than inlined so the scoring function reads
 * as the spec's formula, and so a change has one site.
 *
 * **2.0 and 1.5 are a product judgement, not a measurement** (A27): an asserted
 * influence edge is a stronger claim than a shared player, because the user
 * typed it about this specific pair. Do not describe them as tuned.
 */
const INFLUENCE_WEIGHT = 2.0;
const SHARED_MEMBER_WEIGHT = 1.5;
const WANT_LIST_SUPPRESSION = 3.0;

/**
 * §9.1 (A50): candidates reaching TWO OR MORE owned artists rank above every
 * candidate reaching one, whatever the scores say.
 *
 * **A tier, deliberately NOT a coefficient**, and the difference is the whole
 * design. A coefficient — however large — can be out-summed by enough shared
 * members, and it invites someone later to tune it until the tiers overlap.
 * That overlap is exactly what must not happen, so the ordering is structural:
 * `sortKey` compares the tier first and never adds it to the score.
 *
 * **Because they answer different questions.** Four shared members with one
 * owned band says a band grew out of another — real, and Broken Bones earns the
 * top of that tier. Two people from two different owned bands says two threads
 * in the collection MEET somewhere, which is something the user could not have
 * worked out themselves. Only the second is a discovery, and no amount of the
 * first adds up to it.
 *
 * **This is A27's argument one level in.** A27 refused to merge the influence
 * and shared-member terms because a sum makes four shared people and one strong
 * edge indistinguishable. The same objection applies inside the shared-member
 * term.
 *
 * **DORMANT BY CONSTRUCTION, not broken** (§9.1b). Measured against the live
 * collection: zero of 34 candidates reach two owned artists, because two bands
 * are walked and their lineups do not intersect. A convergence needs at least
 * two walked artists whose members meet in a third band. Zero convergences is a
 * fact about how much has been walked — like §9.1a's unsourced terms — and must
 * not be read as a defect.
 */
const CONVERGENCE_TIER_MINIMUM = 2;

/**
 * How many ADJACENCY suggestions are shown (A53, 2026-09-08).
 *
 * **A display decision, not a cut, and the distinction is the whole point.**
 * Measured over 74 candidates from seven walks: a numeric threshold on the
 * shared-member count cannot work. At 2 you keep Tom & Jerry and
 * Manzarek-Krieger — the same act under another name — and lose nothing worth
 * losing. At 3 you lose Blood, Sweat & Tears, a real discovery, while KEEPING
 * Rick & The Ravens, a rename. **The renames rank high by construction**,
 * because a band of the same people shares the most members with it.
 *
 * So nothing is filtered and no candidate is judged. The list simply stops.
 * **74 rows where 3 are useful trains the reader to skim; 6 rows where 3 are
 * useful does not** — and 55 of those 74 sit at a single shared member, which
 * is graph adjacency rather than a recommendation.
 *
 * **This does NOT require solving the same-act-renamed problem**, which is
 * confirmed unsolvable from the membership graph three ways: the `tribute`
 * relation is the wrong edge, name containment catches "Miles Davis Quintet" and
 * misses "The Notting Hillbillies", and the ratio test is structurally incapable
 * of varying (§9.1's honest limit, NOTES).
 *
 * **Five is a PRODUCT JUDGEMENT, not a measured value** — the same standing as
 * A27's 2.0 and 1.5 weights and §9.2's six suggestions. The reasoning: the
 * measured collection has one convergence and a long adjacency tail, so the
 * screen should carry the discovery plus enough context to judge it. Revisit if
 * Adam finds the list consistently too short; it is one line.
 *
 * **Convergences are NEVER capped.** They are rare — one in 74 measured — and a
 * cap applied to the whole list could push the only real discovery off the
 * screen to make room for adjacency, which inverts the tier A50 exists to
 * enforce.
 */
export const ADJACENCY_SHOWN = 5;

export type Suggestion = CandidateLinkTerms & {
  score: number;
  /**
   * §9.1 (A50): 1 when this candidate reaches two or more owned artists.
   *
   * **Separate from `score` on purpose.** Merging it in would make the tier a
   * coefficient, which is the thing this exists not to be — see
   * `CONVERGENCE_TIER_MINIMUM`. Exposed rather than kept private so a caller can
   * SEE which tier produced an order it is rendering.
   */
  convergence: boolean;
  /**
   * One clause per contributing term.
   *
   * **A list, not a string.** §9.1 assembles the reason "from which terms
   * contributed" and a candidate can be reached by both routes, so a scalar
   * holds the first of several — the failure NOTES records three times, silent
   * every time because the singular case is the common one. Joining is the
   * caller's decision; this layer must not make it irreversible.
   */
  reasons: string[];
};

/**
 * SPEC.md §9.1 — the scored suggestions, highest first.
 *
 * **Suppression, not exclusion.** A want-listed candidate keeps its row and
 * loses 3.0: §9.1 says "suppress, don't hide", and the difference is only
 * observable when the reduced score still ranks inside `limit`. Subtracting
 * BEFORE the sort is what makes it a suppression rather than a cosmetic
 * adjustment to a row whose position was already decided.
 */
/**
 * How many candidates existed before A53's display cap, and how many are shown.
 *
 * **Returned so the screen can SAY it truncated**, rather than rendering six
 * rows that look like the whole answer. A list silently cut is the
 * absent-versus-unknown failure this project keeps naming: "these are all the
 * links" and "these are the strongest six of seventy-four" are different claims
 * and the reader cannot tell them apart.
 */
export async function suggestionCount(): Promise<number> {
  const candidates = await linkTermsForCandidates();
  return candidates.length;
}

export async function suggestions(options: { limit: number }): Promise<Suggestion[]> {
  const candidates = await linkTermsForCandidates();

  const scored = candidates.map((candidate) => {
    const influence = INFLUENCE_WEIGHT * candidate.influenceWeight;
    const shared = SHARED_MEMBER_WEIGHT * candidate.sharedMemberWeight;
    const suppression = candidate.onWantList ? WANT_LIST_SUPPRESSION : 0;

    const reasons: string[] = [];
    if (candidate.influenceArtistCount > 0) {
      const n = candidate.influenceArtistCount;
      reasons.push(`Linked to ${n} artist${n === 1 ? '' : 's'} you own`);
    }
    if (candidate.sharedMemberWeight > 0 && candidate.sharedMemberExemplar !== null) {
      const n = candidate.sharedMemberWeight;
      /*
       * **A50: convergence gets its OWN sentence**, because "shares 2 members
       * with X" is true of both tiers and so cannot explain an order the tier
       * produced. §9.1 requires a reader who sees the evidence to be able to
       * judge it, and a clause that reads identically for the two claims asks
       * them to trust a ranking they cannot see the basis for — the same
       * objection A27 raised against a merged clause.
       *
       * The exemplar is still named, so the sentence stays concrete, but the
       * COUNT of owned artists is what carries the claim.
       */
      if (candidate.sharedMemberArtistCount >= CONVERGENCE_TIER_MINIMUM) {
        reasons.push(
          `Shares ${n} member${n === 1 ? '' : 's'} with ${candidate.sharedMemberArtistCount} artists you own, including ${candidate.sharedMemberExemplar}`,
        );
      } else {
        reasons.push(
          `Shares ${n} member${n === 1 ? '' : 's'} with ${candidate.sharedMemberExemplar}`,
        );
      }
    }
    // §9.1: never a bare score with no reasoning. A row scoring 9 where the
    // arithmetic says 12 is exactly that unless the subtraction is stated.
    if (candidate.onWantList) {
      reasons.push('Already on your want list');
    }

    return {
      ...candidate,
      score: influence + shared - suppression,
      convergence: candidate.sharedMemberArtistCount >= CONVERGENCE_TIER_MINIMUM,
      reasons,
    };
  });

  /*
   * Sorted here, AFTER suppression, then cut. Sorting in SQL and subtracting in
   * TypeScript would order rows by their unsuppressed scores and report the
   * suppressed ones — right numbers, wrong sequence, which is the silent half.
   *
   * Ties break on artist name (A27), and `linkTermsForCandidates` already
   * returns name-ordered rows, so a stable sort preserves that without a second
   * comparison to keep in step with the first.
   */
  /*
   * **Tier FIRST, then score.** A50: a candidate reaching two or more owned
   * artists outranks every candidate reaching one, whatever the scores say —
   * which is why this is a comparison step rather than a term added to `score`.
   * Twenty shared members in one band must still lose to two people from two
   * bands, and no arithmetic can express that.
   *
   * Within a tier the existing order is untouched: score descending, so Broken
   * Bones still tops the adjacency tier and want-list suppression still orders
   * inside both.
   */
  scored.sort((a, b) => {
    if (a.convergence !== b.convergence) return a.convergence ? -1 : 1;
    return b.score - a.score;
  });

  /*
   * **A53's display cap is NOT applied here**, and that was a real mistake
   * caught by `suggestions.test.ts`: capping in this function silently changed
   * §5.8's `GET /api/suggestions`, which the spec says returns `limit` results
   * and defaults to 10. **A screen's editorial decision must not rewrite an API
   * contract** — the endpoint returns the ranking, and the page decides how much
   * of it to render. See `forDisplay` below.
   */
  return scored.slice(0, options.limit);
}


/**
 * The §10 screen's slice of the ranking (A53, 2026-09-08).
 *
 * **Separate from `suggestions` because the cap is EDITORIAL, not a property of
 * the ranking.** §5.8's endpoint returns what the caller asks for; the screen
 * decides how much is worth reading. Collapsing the two silently changed the API
 * contract, which is what `suggestions.test.ts` caught.
 *
 * **Every convergence, then five adjacency rows.** Slicing the combined list
 * would let adjacency push the only real discovery off the screen — the
 * inversion A50's tier exists to prevent, arriving through the display instead
 * of the sort.
 */
export function forDisplay(scored: Suggestion[]): Suggestion[] {
  const convergences = scored.filter((row) => row.convergence);
  const adjacency = scored.filter((row) => !row.convergence).slice(0, ADJACENCY_SHOWN);

  return [...convergences, ...adjacency];
}
