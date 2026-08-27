import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
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

/**
 * SPEC.md §12c (A44) — the genres a parent proposal is built from, each with
 * what it is based on.
 *
 * **Record counts and examples, because the records are what distinguish a
 * general music fact from a fact about THIS shelf.** Measured on the live
 * collection: `Rock` carries 10 records across 10 artists from Buddy Rich to
 * Death Grips — visible in the examples and invisible in the name.
 *
 * **Genres carrying NO records are INCLUDED.** `Punk` and `US Hardcore` carry
 * zero and exist because the user created them as intended parents; dropping
 * them for lack of evidence would remove the answer rather than sharpen it.
 *
 * **Genres the user has already parented are EXCLUDED.** The feature fills the
 * gap §4.1 left; a genre already placed is a decision already made, and
 * re-proposing it would invite overwriting the user's own hierarchy.
 */
export async function genresForParentProposal(): Promise<
  Array<{ id: string; name: string; recordCount: number; examples: string[] }>
> {
  const db = getDb();

  const rows = await db.execute<{
    id: string;
    name: string;
    record_count: number;
    examples: string[] | null;
  }>(sql`
    SELECT
      g.id,
      g.name,
      count(DISTINCT r.id)::int AS record_count,
      -- Three is enough to show how a term is USED without sending the shelf.
      (array_agg(DISTINCT a.name || ' — ' || r.title) FILTER (WHERE r.id IS NOT NULL))[1:3]
        AS examples
    FROM genres g
    LEFT JOIN record_genres rg ON rg.genre_id = g.id
    LEFT JOIN records r ON r.id = rg.record_id
    LEFT JOIN artists a ON a.id = r.artist_id
    WHERE g.parent_genre_id IS NULL
    GROUP BY g.id, g.name
    ORDER BY count(DISTINCT r.id) DESC, g.name
  `);

  return rows.rows.map((row) => ({
    id: row.id,
    name: row.name,
    recordCount: row.record_count,
    examples: row.examples ?? [],
  }));
}

/**
 * Record that the user declined a pairing, so it is never proposed again.
 *
 * **Idempotent**, because clicking reject twice is the same fact rather than an
 * error — the unique constraint says so and this must not throw on a repeat.
 */
export async function rejectParentPairing(input: {
  genreId: string;
  rejectedParentId: string;
}): Promise<void> {
  const db = getDb();

  await db.execute(sql`
    INSERT INTO genre_parent_rejections (genre_id, rejected_parent_id)
    VALUES (${input.genreId}, ${input.rejectedParentId})
    ON CONFLICT (genre_id, rejected_parent_id) DO NOTHING
  `);
}

/** Every declined pairing, for filtering a fresh proposal. */
export async function rejectedPairings(): Promise<
  Array<{ genreId: string; rejectedParentId: string }>
> {
  const db = getDb();

  const rows = await db.execute<{ genre_id: string; rejected_parent_id: string }>(
    sql`SELECT genre_id, rejected_parent_id FROM genre_parent_rejections`,
  );

  return rows.rows.map((row) => ({
    genreId: row.genre_id,
    rejectedParentId: row.rejected_parent_id,
  }));
}
