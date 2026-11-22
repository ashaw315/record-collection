import 'server-only';
import { eq, inArray, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { recordMatchedText, records } from '@/db/schema';
import { isForeignKeyViolation } from '@/lib/api/errors';

/**
 * **SPEC §4.6: the only writer of a record's generated matched text.** It writes `generated`, `generated_model` and
 * `generated_at`, and nothing else, so an edit Adam has made outlives every regeneration. A blank is NULL with no model
 * or time, so "unknown" has one form and the record stays ineligible for the pick.
 */
export async function storeGeneratedMatchedText(recordId: string, text: string | null, model: string, options: { checks?: MatchedTextChecks } = {}): Promise<void> {
  const generated = text === null || text.trim() === '' ? null : text.trim();
  /* A store is a text nobody has read: reviewed_at goes null with it, whatever it was, and the checks are the new draft's or none (22 Nov). */
  const values = { recordId, generated, generatedModel: generated === null ? null : model, generatedAt: generated === null ? null : new Date(), reviewedAt: null, checks: options.checks ?? null };
  await getDb()
    .insert(recordMatchedText)
    .values(values)
    .onConflictDoUpdate({
      target: recordMatchedText.recordId,
      set: { generated: sql`excluded.generated`, generatedModel: sql`excluded.generated_model`, generatedAt: sql`excluded.generated_at`, reviewedAt: sql`excluded.reviewed_at`, checks: sql`excluded.checks` },
    });
}

/**
 * **The mechanical checks that travel with a draft (Design, 22 Nov):** the sentences the client dropped for describing the
 * material, the self-consistency disagreements (src/lib/matched-text/consistency.ts), and the indexes of sentences whose
 * people-count exceeds the credited names. Never the drafting model's own basis marks (§67; Q75).
 */
export type MatchedTextChecks = { dropped: string[]; disagreements: Array<{ a: number; b: number; why: string }>; numbered: number[] };

/**
 * **Adam's mark (the coordinator, 22 Nov):** the text is read. With `text`, read and corrected: the correction is his edit,
 * through the same columns §5.2's PATCH writes, so the pick reads it and a regeneration never replaces it. Nothing else
 * moves. A record with no row has no text to mark, and is not found like a record that is not there.
 */
export async function markMatchedTextReviewed(recordId: string, options: { text?: string } = {}): Promise<MatchedTextWrite> {
  const now = new Date();
  const corrected = options.text === undefined ? null : options.text.trim();
  const set = corrected === null ? { reviewedAt: now } : { reviewedAt: now, edited: corrected, editedAt: now };
  const updated = await getDb().update(recordMatchedText).set(set).where(eq(recordMatchedText.recordId, recordId)).returning({ id: recordMatchedText.recordId });
  return updated.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

/**
 * **Adam's rejection (22 Nov):** the row goes, so the record leaves the pool and `recordsToDraft('all')` lists it again;
 * the next drafting pass writes a new row. Not a clear of `generated` alone: a row with every text null would still be a
 * row, and §4.8's counts read rows.
 */
export async function rejectMatchedText(recordId: string): Promise<MatchedTextWrite> {
  const deleted = await getDb().delete(recordMatchedText).where(eq(recordMatchedText.recordId, recordId)).returning({ id: recordMatchedText.recordId });
  return deleted.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

export type UnreviewedText = {
  id: string;
  artist: string;
  title: string;
  about: string | null;
  aboutUnreviewed: boolean;
  matched: string | null;
  matchedUnreviewed: boolean;
  checks: MatchedTextChecks | null;
  /** The later of the matched text's time and the record's last update: the list is newest first, so a backlog never stands between Adam and a new import (the coordinator, 22 Nov). */
  since: string;
};

/**
 * **What Adam has not read (22 Nov):** every record whose matched text or ABOUT is present and unreviewed, with both texts
 * so he reads them together, and which of the two is unread. The matched text is the effective one, his edit where there
 * is one, since an edit is a read and an unread row has none.
 */
export async function unreviewedTexts(): Promise<UnreviewedText[]> {
  return (await getDb().execute<UnreviewedText>(sql`
    SELECT r.id, a.name AS artist, r.title,
           nullif(r.snippet, '') AS about,
           (nullif(r.snippet, '') IS NOT NULL AND r.snippet_reviewed_at IS NULL) AS "aboutUnreviewed",
           coalesce(m.edited, m.generated) AS matched,
           (coalesce(m.edited, m.generated) IS NOT NULL AND m.reviewed_at IS NULL) AS "matchedUnreviewed",
           m.checks,
           greatest(m.generated_at, m.edited_at, r.updated_at)::text AS since
    FROM records r JOIN artists a ON a.id = r.artist_id
    LEFT JOIN record_matched_text m ON m.record_id = r.id
    WHERE (nullif(r.snippet, '') IS NOT NULL AND r.snippet_reviewed_at IS NULL)
       OR (coalesce(m.edited, m.generated) IS NOT NULL AND m.reviewed_at IS NULL)
    ORDER BY greatest(m.generated_at, m.edited_at, r.updated_at) DESC NULLS LAST, a.name, r.title`)).rows;
}

/** §5.2's six fields less `effective`, which the route derives. Every field null is a record with no row. */
export type MatchedTextState = {
  generated: string | null;
  generatedModel: string | null;
  generatedAt: Date | null;
  edited: string | null;
  editedAt: Date | null;
};

export type MatchedTextWrite = { ok: true } | { ok: false; reason: 'not_found' };

const NO_ROW: MatchedTextState = { generated: null, generatedModel: null, generatedAt: null, edited: null, editedAt: null };

/**
 * **The record's matched text, or null where the record does not exist.** Two absences kept apart, as the snippet's are
 * (§5.2): a record with no row answers every field null, since no matched text is a state of the record and the edit
 * sheet has to open on it so Adam can write one; a record that is not there is not found.
 */
export async function readMatchedText(recordId: string): Promise<MatchedTextState | null> {
  const [found] = await getDb()
    .select({
      generated: recordMatchedText.generated,
      generatedModel: recordMatchedText.generatedModel,
      generatedAt: recordMatchedText.generatedAt,
      edited: recordMatchedText.edited,
      editedAt: recordMatchedText.editedAt,
    })
    .from(records)
    .leftJoin(recordMatchedText, eq(recordMatchedText.recordId, records.id))
    .where(eq(records.id, recordId));
  if (found === undefined) return null;
  return { ...NO_ROW, ...found };
}

/**
 * **§5.2's PATCH, the only writer of `edited`:** `edited` and `edited_at`, and nothing else, inserting the row where none
 * exists so a record the model never described can be described by hand and then counts as covered (§4.8). The text
 * arrives trimmed and non-blank from the route's schema; the CHECK is the last guard. One statement: a missing record
 * fails the foreign key rather than a check-then-act, and that failure is the not-found.
 */
export async function editMatchedText(recordId: string, text: string): Promise<MatchedTextWrite> {
  try {
    await getDb()
      .insert(recordMatchedText)
      /* An edit is a read (22 Nov): reviewed_at moves with it, so a text Adam corrected never lists as unread. */
      .values({ recordId, edited: text, editedAt: new Date(), reviewedAt: new Date() })
      .onConflictDoUpdate({ target: recordMatchedText.recordId, set: { edited: sql`excluded.edited`, editedAt: sql`excluded.edited_at`, reviewedAt: sql`excluded.reviewed_at` } });
    return { ok: true };
  } catch (error) {
    if (isForeignKeyViolation(error)) return { ok: false, reason: 'not_found' };
    throw error;
  }
}

/**
 * **§5.2's DELETE:** clears `edited` and `edited_at`, never `generated`, so the pick reads the generated text again.
 * Idempotent: a record with no edit, or no row, already holds the state asked for, and no row is created to say so.
 */
export async function clearMatchedTextEdit(recordId: string): Promise<MatchedTextWrite> {
  const db = getDb();
  const [exists] = await db.select({ id: records.id }).from(records).where(eq(records.id, recordId));
  if (exists === undefined) return { ok: false, reason: 'not_found' };
  await db.update(recordMatchedText).set({ edited: null, editedAt: null }).where(eq(recordMatchedText.recordId, recordId));
  return { ok: true };
}

export type DraftRow = { id: string; artist: string; title: string; year: number | null; about: string | null; payload: unknown };

/**
 * **The records the drafting script drafts (scripts/write-matched-text.mts):** by short id prefix, or every record with
 * no matched text, generated or edited. Each with what the prompt needs: artist, title, the album's year, the ABOUT as
 * context, and the cached Discogs payload, or null where none is cached. The prefixes go as one array parameter: its
 * first form, `= ANY((…))`, was a row constructor, which failed the script's first real run (42809) before any call.
 */
export async function recordsToDraft(selection: { prefixes: readonly string[] } | 'all'): Promise<DraftRow[]> {
  const where = selection === 'all'
    ? sql`m.generated IS NULL AND m.edited IS NULL`
    /*
      inArray over the expression, which Drizzle writes as a parameterised IN list, one parameter per prefix: nothing is
      concatenated into the SQL. Its first form, = ANY((…)), was a row constructor (42809), and = ANY(${array}) is the
      same, since Drizzle expands an array into one parameter per element.
    */
    : inArray(sql`left(r.id::text, 8)`, [...selection.prefixes]);
  return (await getDb().execute<DraftRow>(sql`
    SELECT r.id, a.name AS artist, r.title, r.release_year AS year, nullif(r.snippet, '') AS about, c.payload
    FROM records r JOIN artists a ON a.id = r.artist_id
    LEFT JOIN pressings p ON p.id = r.pressing_id
    LEFT JOIN discogs_cache c ON c.discogs_release_id = p.discogs_release_id
    LEFT JOIN record_matched_text m ON m.record_id = r.id
    WHERE ${where}
    ORDER BY a.name, r.title`)).rows;
}

/** Every record's id, title and artist, for the ask's diagnostic to name what it picked (scripts/ask-diagnostic.mts). */
export async function collectionTitles(): Promise<Array<{ id: string; title: string; artist: string }>> {
  return (await getDb().execute<{ id: string; title: string; artist: string }>(sql`
    SELECT r.id, r.title, a.name AS artist FROM records r JOIN artists a ON a.id = r.artist_id ORDER BY a.name, r.title`)).rows;
}
