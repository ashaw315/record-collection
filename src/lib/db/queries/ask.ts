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

/** Whether the latch is thrown: its row. */
async function latched(): Promise<boolean> {
  const [held] = await getDb().select({ name: appLatches.name }).from(appLatches).where(eq(appLatches.name, PICK_LATCH));
  return held !== undefined;
}

/** Coverage complete: at least one record has matched text, and none with an ABOUT lacks it. Never vacuous. */
async function coverageComplete(): Promise<boolean> {
  const [row] = await getDb()
    .select({
      described: sql<number>`count(*) FILTER (WHERE ${recordMatchedText.edited} IS NOT NULL OR ${recordMatchedText.generated} IS NOT NULL)::int`,
      uncovered: sql<number>`count(*) FILTER (WHERE nullif(${records.snippet}, '') IS NOT NULL AND ${recordMatchedText.edited} IS NULL AND ${recordMatchedText.generated} IS NULL)::int`,
    })
    .from(records)
    .leftJoin(recordMatchedText, eq(recordMatchedText.recordId, records.id));
  return (row?.described ?? 0) > 0 && (row?.uncovered ?? 1) === 0;
}

/** Whether the pick is live, read and never written: for a page render, which is no place to throw the latch. */
export async function pickLive(): Promise<boolean> {
  return (await latched()) || coverageComplete();
}

/** The route's read: live as above, and the latch thrown where coverage is complete and it was not yet. */
export async function pickEngaged(options: { write?: () => Promise<void> } = {}): Promise<boolean> {
  if (await latched()) return true;
  if (!(await coverageComplete())) return false;
  /* A write that fails does not fail the ask (the coordinator, 14 Nov): coverage is complete, so this ask picks, and the next one sets the latch. */
  try {
    await (options.write ?? throwPickLatch)();
  } catch (error) {
    logger.error('ask.latch', `the pick's latch was not written: ${error instanceof Error ? error.message : String(error)}`);
  }
  return true;
}

/**
 * §P.6's count line by mode ("Matched by role and count line", 14 Nov): records with no text to be matched by, which
 * is no ABOUT while the ask ranks and no matched text once the pick is live. Over the whole collection, never the pool.
 */
export async function countNotDescribed(): Promise<number> {
  if (!(await pickLive())) return countWithoutAbout();
  const [row] = await getDb()
    .select({ n: sql<number>`count(*)::int` })
    .from(records)
    .leftJoin(recordMatchedText, eq(recordMatchedText.recordId, records.id))
    .where(sql`${recordMatchedText.edited} IS NULL AND ${recordMatchedText.generated} IS NULL`);
  return row?.n ?? 0;
}

/**
 * The pick's eligible records in a pool: those with matched text, each read as its edit where Adam has written one
 * and its generated text otherwise, never both (SPEC §4.6). A record with neither is not eligible (§P.6's pattern).
 */
export async function matchedTextsFor(recordIds: readonly string[]): Promise<Array<{ id: string; text: string; year: number | null }>> {
  if (recordIds.length === 0) return [];
  const db = getDb();
  /* The release year with the text ("Release year to the pick", Design, 21 Nov): the record's own row, null where none is stored. */
  const rows = await db
    .select({ id: recordMatchedText.recordId, text: sql<string | null>`coalesce(${recordMatchedText.edited}, ${recordMatchedText.generated})`, year: records.releaseYear })
    .from(recordMatchedText)
    .innerJoin(records, eq(records.id, recordMatchedText.recordId))
    .where(inArray(recordMatchedText.recordId, [...recordIds]));
  return rows.filter((r): r is { id: string; text: string; year: number | null } => r.text !== null);
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
