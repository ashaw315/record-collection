import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { recordEmbeddings, records } from '@/db/schema';
import { nameSortKey } from '@/lib/db/name-sort';

/**
 * **Q22's ask, the reads (§P.2 as it stands).** The pool is the page's: every match of the filters and the search on
 * every page, handed to the route as ids; this reads the stored vectors of the pool's records that have one, from the
 * model the query embeds with, so a vector from another model is never compared. A title asks from its own record,
 * found by §T.4's name key in SQL, the one key, never a copy in JavaScript (Design, "Names lists keyed too", 11 Nov).
 */

export async function embeddingsFor(recordIds: readonly string[], model: string): Promise<Array<{ recordId: string; vector: number[] }>> {
  if (recordIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ recordId: recordEmbeddings.recordId, vector: recordEmbeddings.vector })
    .from(recordEmbeddings)
    .where(and(inArray(recordEmbeddings.recordId, [...recordIds]), eq(recordEmbeddings.model, model)));
  return rows.map((row) => ({ recordId: row.recordId, vector: row.vector as number[] }));
}

/** The record in the pool whose title the phrase names by the name sort key, or null; the first by id where two share a title. */
export async function recordByTitleKey(phrase: string, recordIds: readonly string[]): Promise<string | null> {
  if (recordIds.length === 0) return null;
  const db = getDb();
  const rows = await db
    .select({ id: records.id })
    .from(records)
    .where(and(inArray(records.id, [...recordIds]), sql`${nameSortKey(records.title)} = ${nameSortKey(sql`${phrase}::text`)}`))
    .orderBy(records.id)
    .limit(1);
  return rows[0]?.id ?? null;
}
