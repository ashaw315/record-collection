import 'server-only';
import { desc, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { pressingAssessments, wantList } from '@/db/schema';
import type { PressingVerdict } from '@/lib/llm/pressing-assessment-client';

/**
 * SPEC.md §12b (A43) — the stored pressing assessment.
 *
 * **Stored because it does not go stale**, which is a stronger case than A39's:
 * a gap analysis is a claim about a collection that CHANGES, while this is a
 * claim about an album's pressing history, which does not. So there is no reason
 * to ask twice, and each album costs one of ten hourly requests exactly once.
 *
 * **Not editable** (§7.8): editing transfers ownership, and an edited assessment
 * would be neither Claude's nor cleanly the user's while still labelled as
 * Claude's. `best_dig_notes` is where the user's own judgement goes, and keeping
 * them apart is what makes disagreement visible.
 */

export type StoredAssessment = {
  /** Narrowed on read: the column is TEXT, the domain is three values (A43). */
  verdict: PressingVerdict;
  pressings: Array<{ description: string; identifier: string }>;
  dropped: number;
  /** The model's stated ordering basis, or null for no particular order. */
  orderedBy: string | null;
  askedAt: Date;
};

export async function storeAssessment(
  wantListId: string,
  input: {
    verdict: string;
    pressings: Array<{ description: string; identifier: string }>;
    dropped: number;
    orderedBy: string | null;
  },
): Promise<void> {
  const db = getDb();

  /*
   * **Insert-then-trim, keeping CURRENT PLUS ONE** (A58, 2026-09-08).
   *
   * A43 upserted: one assessment per row, replaced on re-ask, because "nothing
   * reads a superseded one". Accurate, and the wrong question. Adam asked twice
   * about one record and got CAD 3016 then CAD 3020 for a release numbered
   * CAD 3X38 — **the disagreement is the strongest evidence available that
   * neither answer is knowledge**, and replacing destroyed it.
   *
   * Same shape and same reasoning as A39's gap-analysis retention: the value of
   * a stored answer is not only what the app reads, it is what the user can
   * compare.
   */
  await db.insert(pressingAssessments).values({
    wantListId,
    verdict: input.verdict,
    pressings: input.pressings,
    dropped: input.dropped,
    orderedBy: input.orderedBy,
  });

  /*
   * Trim to two. A delete keyed on "not in the newest two" rather than a count,
   * so a concurrent write cannot leave three — the row set is decided by the
   * same ordering the reads use.
   */
  await db.execute(sql`
    DELETE FROM pressing_assessments
     WHERE want_list_id = ${wantListId}
       AND id NOT IN (
         SELECT id FROM pressing_assessments
          WHERE want_list_id = ${wantListId}
          ORDER BY asked_at DESC, id DESC
          LIMIT 2
       )
  `);
}

/**
 * The current assessment and the one before it (A58).
 *
 * **`previous` is null after a single ask**, which is not the same as a previous
 * answer that was empty — A39's absent-versus-empty distinction, one row down. A
 * caller must render nothing rather than an empty comparison.
 */
export async function assessmentWithPrevious(wantListId: string): Promise<{
  current: StoredAssessment | null;
  previous: StoredAssessment | null;
}> {
  const db = getDb();

  const rows = await db
    .select()
    .from(pressingAssessments)
    .where(eq(pressingAssessments.wantListId, wantListId))
    .orderBy(desc(pressingAssessments.askedAt), desc(pressingAssessments.id))
    .limit(2);

  const shape = (row: (typeof rows)[number] | undefined): StoredAssessment | null =>
    row === undefined
      ? null
      : {
          verdict: row.verdict as PressingVerdict,
          pressings: row.pressings as Array<{ description: string; identifier: string }>,
          dropped: row.dropped,
          orderedBy: row.orderedBy,
          askedAt: row.askedAt,
        };

  return { current: shape(rows[0]), previous: shape(rows[1]) };
}

export async function latestAssessment(wantListId: string): Promise<StoredAssessment | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(pressingAssessments)
    .where(eq(pressingAssessments.wantListId, wantListId))
    /*
     * **`id` breaks the tie** (A58). With retention now keeping two rows,
     * `asked_at` alone is not a total order — two assessments written in the
     * same millisecond would return either, and the trim above uses this exact
     * ordering. A read disagreeing with the trim could return the row the trim
     * is about to delete.
     */
    .orderBy(desc(pressingAssessments.askedAt), desc(pressingAssessments.id))
    .limit(1);

  if (row === undefined) return null;

  return {
    verdict: row.verdict as PressingVerdict,
    pressings: row.pressings as StoredAssessment['pressings'],
    dropped: row.dropped,
    orderedBy: row.orderedBy,
    askedAt: row.askedAt,
  };
}

/** Removes an assessment. Deleting is not editing — it writes nothing. */
export async function clearAssessment(wantListId: string): Promise<void> {
  const db = getDb();

  await db.delete(pressingAssessments).where(eq(pressingAssessments.wantListId, wantListId));
}

/**
 * The assessment for a record, reached through the want-list row it came from.
 *
 * **This is the direction that makes storage useful after acquiring**: "is mine
 * the good one" is asked on the RECORD, not on a want-list row the user has
 * stopped looking at. §7.3 keeps that row (`acquireWantListItem` marks it rather
 * than deleting), so the path exists — and it is TESTED rather than asserted,
 * because "true in the schema, unproven in the app" is exactly the shape
 * `/want-list/:id/edit` had when it went ten steps unnoticed.
 */
export async function assessmentForRecord(recordId: string): Promise<StoredAssessment | null> {
  const db = getDb();

  const [row] = await db
    .select({
      verdict: pressingAssessments.verdict,
      pressings: pressingAssessments.pressings,
      dropped: pressingAssessments.dropped,
      orderedBy: pressingAssessments.orderedBy,
      askedAt: pressingAssessments.askedAt,
    })
    .from(pressingAssessments)
    .innerJoin(wantList, eq(wantList.id, pressingAssessments.wantListId))
    .where(eq(wantList.acquiredRecordId, recordId))
    .limit(1);

  if (row === undefined) return null;

  return {
    verdict: row.verdict as PressingVerdict,
    pressings: row.pressings as StoredAssessment['pressings'],
    dropped: row.dropped,
    orderedBy: row.orderedBy,
    askedAt: row.askedAt,
  };
}
