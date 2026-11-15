import 'server-only';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { logger } from '@/lib/logger';
import { appLatches, recordEmbeddings, recordMatchedText, records } from '@/db/schema';
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

const PICK_LATCH = 'ask_pick';

/**
 * **The pick's one-way latch (the coordinator, 14 Nov, correcting "any").** The ask's model pick engages when every
 * record that has an ABOUT also has matched text (SPEC §4.6), coverage complete, and from then on never returns to the
 * ranking: one described record among 53 is not a pick over one record, and record 56 arriving without matched text
 * joins §P.6's ineligible count rather than flipping the collection back. Thrown here, on the first ask that finds
 * coverage complete, and held by its row (§4.8).
 */
/** The latch's write, insert-if-absent, so two asks finding coverage together write one row. */
const throwPickLatch = async (): Promise<void> => {
  await getDb().insert(appLatches).values({ name: PICK_LATCH }).onConflictDoNothing();
};

export async function pickEngaged(options: { write?: () => Promise<void> } = {}): Promise<boolean> {
  const db = getDb();
  const [held] = await db.select({ name: appLatches.name }).from(appLatches).where(eq(appLatches.name, PICK_LATCH));
  if (held !== undefined) return true;
  const [row] = await db
    .select({
      described: sql<number>`count(*) FILTER (WHERE ${recordMatchedText.edited} IS NOT NULL OR ${recordMatchedText.generated} IS NOT NULL)::int`,
      uncovered: sql<number>`count(*) FILTER (WHERE nullif(${records.snippet}, '') IS NOT NULL AND ${recordMatchedText.edited} IS NULL AND ${recordMatchedText.generated} IS NULL)::int`,
    })
    .from(records)
    .leftJoin(recordMatchedText, eq(recordMatchedText.recordId, records.id));
  if ((row?.described ?? 0) === 0 || (row?.uncovered ?? 1) > 0) return false;
  /* A write that fails does not fail the ask (the coordinator, 14 Nov): coverage is complete, so this ask picks, and the next one sets the latch. */
  try {
    await (options.write ?? throwPickLatch)();
  } catch (error) {
    logger.error('ask.latch', `the pick's latch was not written: ${error instanceof Error ? error.message : String(error)}`);
  }
  return true;
}

/**
 * The pick's eligible records in a pool: those with matched text, each read as its edit where Adam has written one
 * and its generated text otherwise, never both (SPEC §4.6). A record with neither is not eligible (§P.6's pattern).
 */
export async function matchedTextsFor(recordIds: readonly string[]): Promise<Array<{ id: string; text: string }>> {
  if (recordIds.length === 0) return [];
  const db = getDb();
  const rows = await db
    .select({ id: recordMatchedText.recordId, text: sql<string | null>`coalesce(${recordMatchedText.edited}, ${recordMatchedText.generated})` })
    .from(recordMatchedText)
    .where(inArray(recordMatchedText.recordId, [...recordIds]));
  return rows.filter((r): r is { id: string; text: string } => r.text !== null);
}

/**
 * §P.6's count line (Q22's control): how many records have no ABOUT, over the whole collection and never the pool,
 * so a filter never changes the line; null and empty are both "without".
 */
export async function countWithoutAbout(): Promise<number> {
  const db = getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(records)
    .where(sql`nullif(${records.snippet}, '') IS NULL`);
  return row?.n ?? 0;
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
