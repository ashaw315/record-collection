import 'server-only';
import { desc, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { gapAnalysisResults } from '@/db/schema';
import type { Suggestion } from '@/lib/llm/parse-suggestions';

/**
 * SPEC.md §9.2 (A39) — the last gap analysis, for display.
 *
 * **A record of what was said, not a cache.** Nothing here is ever returned in
 * place of a request the user made: `POST /api/suggestions/ai` always calls the
 * model. This exists so that having asked once, the user does not have to spend
 * a second of ten hourly requests to see the same answer again.
 */

export type StoredGapAnalysis = {
  suggestions: Suggestion[];
  dropped: number;
  askedAt: Date;
  /**
   * Records added since the analysis was asked.
   *
   * **The fact the timestamp does not carry.** "Asked 20 minutes ago" is about
   * the REQUEST; what the reader needs is whether the answer still applies, and
   * the two diverge in the dangerous direction — two minutes with five records
   * added reads as fresh and is not. A gap analysis is a claim about what is
   * MISSING, so adding records is exactly the event that invalidates it.
   *
   * **Records only.** A want-list row does change what the model is told, but
   * records are what the suggestions are ABOUT, and a sentence carrying two
   * numbers — or blurring both into "changes" — is vaguer than either and less
   * likely to be read. Deliberate omission, not an oversight (A39).
   */
  recordsAddedSince: number;
};

export async function storeGapAnalysis(input: {
  suggestions: Suggestion[];
  dropped: number;
}): Promise<void> {
  const db = getDb();

  /*
   * Delete-then-insert rather than an upsert on a fixed id: the table has no
   * natural key, and inventing a sentinel row to update would make "never
   * asked" and "asked and got nothing" indistinguishable — the absent-versus-
   * unknown failure this project keeps naming.
   *
   * Superseded rows are removed here rather than by a scheduled cleanup, for
   * the reason §4.3 gives about `llm_requests` carrying its own timestamps:
   * a job that must run is a job that can fail to run.
   */
  await db.transaction(async (tx) => {
    await tx.delete(gapAnalysisResults);
    await tx.insert(gapAnalysisResults).values({
      suggestions: input.suggestions,
      dropped: input.dropped,
    });
  });
}

export async function latestGapAnalysis(): Promise<StoredGapAnalysis | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(gapAnalysisResults)
    .orderBy(desc(gapAnalysisResults.askedAt))
    .limit(1);

  if (row === undefined) return null;

  /*
   * Counted in the database rather than in JS: the alternative is loading every
   * record to compare timestamps, which is the collection-scan §9.2 avoids
   * everywhere else.
   */
  const counted = await db.execute<{ n: number }>(
    sql`SELECT count(*)::int AS n FROM records WHERE created_at > ${row.askedAt}`,
  );

  return {
    // Stored as JSON because it is the model's output rather than the app's
    // data; validated on the way IN by `parseSuggestions` (A29d).
    suggestions: row.suggestions as Suggestion[],
    dropped: row.dropped,
    askedAt: row.askedAt,
    recordsAddedSince: Number(counted.rows[0]?.n ?? 0),
  };
}
