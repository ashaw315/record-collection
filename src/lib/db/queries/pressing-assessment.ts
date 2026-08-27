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
   * Upsert on the unique `want_list_id`: one assessment per row, replaced on
   * re-ask. Nothing reads a superseded one, so a history would be a table
   * growing for a use case nobody has named — and re-asking is a deliberate act
   * that costs a request, so replacing is what the user asked for.
   */
  await db
    .insert(pressingAssessments)
    .values({
      wantListId,
      verdict: input.verdict,
      pressings: input.pressings,
      dropped: input.dropped,
      orderedBy: input.orderedBy,
    })
    .onConflictDoUpdate({
      target: pressingAssessments.wantListId,
      set: {
        verdict: input.verdict,
        pressings: input.pressings,
        dropped: input.dropped,
        orderedBy: input.orderedBy,
        askedAt: sql`now()`,
      },
    });
}

export async function latestAssessment(wantListId: string): Promise<StoredAssessment | null> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(pressingAssessments)
    .where(eq(pressingAssessments.wantListId, wantListId))
    .orderBy(desc(pressingAssessments.askedAt))
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
