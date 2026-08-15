import 'server-only';
import { sql } from 'drizzle-orm';
import { genres } from '@/db/schema';

/**
 * SPEC.md §7.1's hierarchy, as ONE implementation.
 *
 * "A record tagged with a child genre is implicitly a member of all ancestor
 * genres for filtering **and graph purposes**." That sentence binds three
 * callers — the collection list, the want list, and the graph — and until this
 * module existed it was implemented three times.
 *
 * **The drift was predicted and then happened.** NOTES recorded the two
 * identical copies in `records.ts` and `want-list.ts` as a deferred risk, naming
 * the failure exactly: "a §7.1 fix applied to one file leaves the other
 * filtering by a different rule, with both screens returning a plausible 200."
 * What actually shipped was worse than the prediction — the graph was written
 * later with flat equality (`rg.genre_id = $1`) and never matched a descendant
 * at all, so filtering the graph by Punk returned an EMPTY payload while
 * `/?genreId=<Punk>` returned the records. Measured on `Punk > UK82 > Oi!` with
 * one record tagged only `Oi!`: records=1, wantList=1, graphNodes=0.
 *
 * The two identical copies were the correct rule; the third was not. This is
 * the one they collapse into.
 *
 * **`server-only`, and that is why this is its own module rather than a helper
 * exported from `records.ts`.** That file is `server-only` too, so importing it
 * from the graph layer is fine — but a shared rule living inside one caller
 * invites the next caller to copy rather than import, which is how there came
 * to be three. CLAUDE.md §6 keeps the boundary; a third file is the price.
 */

/**
 * The genre and everything beneath it, as a subquery.
 *
 * Walks DOWN from the requested genre rather than up from each record's genres:
 * the question is "which genres count as this one", and answering it once per
 * query beats answering it once per row.
 *
 * **Downward only, and the direction is load-bearing.** §7.1 makes a child a
 * member of its ancestors, never the reverse — a record tagged only `Punk` is
 * not a UK82 record. A walk that went upward would claim it was, which is the
 * genre-flattening CLAUDE.md §8 forbids, arriving as a filter result.
 *
 * `UNION` rather than `UNION ALL`, matching `wouldCreateCycle` in ./genres — the
 * cycle guard is the only thing preventing a loop in the data, and if it is ever
 * defeated, duplicate elimination stops this walking forever.
 *
 * §7.1 says "do not denormalize", which is why this is computed per query rather
 * than kept in a closure table.
 */
export function genreSubtree(genreId: string) {
  return sql`(
    WITH RECURSIVE subtree AS (
      SELECT id FROM ${genres} WHERE id = ${genreId}
      UNION
      SELECT g.id FROM ${genres} g JOIN subtree s ON g.parent_genre_id = s.id
    )
    SELECT id FROM subtree
  )`;
}
