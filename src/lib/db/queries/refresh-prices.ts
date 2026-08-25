import 'server-only';
import { and, isNotNull } from 'drizzle-orm';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { pressings, records } from '@/db/schema';

/**
 * The selection half of SPEC.md §5.7's price refresh (§12 step 16's cron).
 *
 * §5.7 says "all items with a `discogs_release_id`", and that id lives on
 * `pressings` rather than on `records` — so a refreshable record is one whose
 * `pressing_id` resolves to a pressing carrying the id. A record with no
 * pressing, or with a hand-entered pressing that has no Discogs id, is not
 * refreshable and is absent from this list rather than present with a null.
 */

export type RefreshTarget = {
  recordId: string;
  discogsReleaseId: number;
};

/**
 * **One row per RECORD, not per release**, and the difference is a real case
 * rather than a technicality. §4 states duplicate records are legal and
 * expected: two copies of the same pressing are two `records` rows sharing one
 * `pressing_id`, each with its own price history. Collapsing to distinct
 * releases would refresh one copy and leave the other's history frozen.
 *
 * The caller may still fetch a shared release once — that is a transport
 * concern, and it is where the 60/minute budget is spent — but the unit of
 * WRITING is the record.
 */
export async function recordsToRefresh(): Promise<RefreshTarget[]> {
  const db = getDb();

  const rows = await db
    .select({
      recordId: records.id,
      discogsReleaseId: pressings.discogsReleaseId,
    })
    .from(records)
    .innerJoin(pressings, eq(records.pressingId, pressings.id))
    .where(and(isNotNull(records.pressingId), isNotNull(pressings.discogsReleaseId)))
    .orderBy(records.id);

  /**
   * Narrowed rather than cast. The `isNotNull` above makes this filter
   * redundant at runtime, and that is the point: a cast would ASSERT the
   * invariant while this one ENFORCES it. If the predicate above is ever
   * loosened, a cast hands a null release id to a URL builder and fetches
   * `/marketplace/stats/null`; this drops the row instead.
   */
  return rows.flatMap((row) =>
    row.discogsReleaseId === null
      ? []
      : [{ recordId: row.recordId, discogsReleaseId: row.discogsReleaseId }],
  );
}
