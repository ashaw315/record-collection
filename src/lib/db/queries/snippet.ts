import 'server-only';
import { eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { artists, records } from '@/db/schema';

/**
 * SPEC.md §10b's snippet, and §7.8's ownership rule over it.
 *
 * **`snippet_edited_at` is the whole design.** Null means the text is as
 * generated and the app may replace it; non-null means the USER owns it and a
 * regeneration must not proceed without their explicit confirmation (§4.2,
 * A31a). §4.2 rejected a boolean for a reason worth repeating: `false` would
 * mean both "generated" and "never asked", two different facts collapsed into
 * one value at write time.
 *
 * **Why this module exists without any LLM in it.** 13c is split so the
 * ownership rule is judged alone (§12). Every other failure in this feature is
 * recoverable — a bad snippet is regenerated, a failed call is retried — but
 * silently overwriting text the user wrote is permanent, and nothing afterwards
 * knows it existed. A rule about who owns a piece of text is pure state, so it
 * is provable with no mock, no fixture and no injected client.
 */

/** §10b: the two fields, as the panel and the routes need them. */
export type SnippetState = {
  snippet: string | null;
  snippetEditedAt: Date | null;
};

export type SnippetWrite =
  | { ok: true }
  | { ok: false; reason: 'not_found' }
  /** §7.8: the user owns this text and did not confirm its replacement. */
  | { ok: false; reason: 'user_owns_snippet' };

/**
 * The snippet's state, or null when the record does not exist.
 *
 * **Two different absences, kept apart.** A record with no snippet is a
 * successful read of nothing (§10b: "absence is fine"); a record that does not
 * exist is a 404. Returning an empty state for both would let a route answer 200
 * for a record that was never there.
 */
export async function readSnippet(recordId: string): Promise<SnippetState | null> {
  const db = getDb();

  const found = await db
    .select({ snippet: records.snippet, snippetEditedAt: records.snippetEditedAt })
    .from(records)
    .where(eq(records.id, recordId));

  return found[0] ?? null;
}

/**
 * Stores a generated snippet, refusing when the user owns the current one.
 *
 * **The refusal and the write are ONE statement, and that is deliberate.** A
 * `SELECT snippet_edited_at` followed by an `UPDATE` is check-then-act: an edit
 * committed between the two would be overwritten by a regeneration that read a
 * null timestamp and believed it. The window is small and the loss is permanent,
 * which is the combination this project has been caught by before (§7.3's
 * acquire flow, §9.2's rate limiter). `WHERE snippet_edited_at IS NULL` puts the
 * condition in the write itself, so **zero rows updated IS the refusal**.
 *
 * `confirmReplace` drops that condition rather than adding a separate path:
 * §10b (A31a) offers the replacement with its consequence named, and a
 * confirmed replace is the user exercising ownership rather than the app
 * ignoring it.
 */
export async function storeGeneratedSnippet(
  recordId: string,
  snippet: string,
  options: { confirmReplace?: boolean } = {},
): Promise<SnippetWrite> {
  const db = getDb();

  /*
   * Ownership returns to the app on a confirmed replace. Leaving the timestamp
   * set would make the record permanently sticky — every future regeneration
   * prompting about an edit that no longer exists, which is a confirmation the
   * user cannot make true by any action.
   */
  const updated = await db
    .update(records)
    .set({ snippet, snippetEditedAt: null })
    .where(
      options.confirmReplace === true
        ? eq(records.id, recordId)
        : sql`${records.id} = ${recordId} AND ${records.snippetEditedAt} IS NULL`,
    )
    .returning({ id: records.id });

  if (updated.length > 0) return { ok: true };

  /*
   * Zero rows means one of two things and the caller needs to tell them apart:
   * the record is missing (404) or the user owns the text (409). Read AFTER the
   * failed write rather than before — a pre-read would be the check-then-act
   * shape this function exists to avoid, and this path is not hot.
   */
  const exists = await db
    .select({ id: records.id })
    .from(records)
    .where(eq(records.id, recordId));

  return exists.length === 0
    ? { ok: false, reason: 'not_found' }
    : { ok: false, reason: 'user_owns_snippet' };
}

/**
 * Saves a user's edit and records that they now own the text.
 *
 * Always sets `snippet_edited_at`: an edit is exactly the act that transfers
 * ownership, so there is no case where the user types text and the app keeps
 * the right to replace it unasked.
 */
export async function editSnippet(recordId: string, snippet: string): Promise<SnippetWrite> {
  const db = getDb();

  const updated = await db
    .update(records)
    .set({ snippet, snippetEditedAt: new Date() })
    .where(eq(records.id, recordId))
    .returning({ id: records.id });

  return updated.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

/**
 * Clears the snippet text.
 *
 * **§4.2: "Deleting a snippet sets `snippet` to null and leaves
 * `snippet_edited_at` alone — a deliberate deletion is an edit."** The user owns
 * the ABSENCE as much as they would own replacement text: they chose to have
 * none, and a regeneration filling it back in unasked would overrule that
 * choice.
 *
 * **But only when they owned the text to begin with.** Deleting a snippet the
 * APP wrote is discarding a generated draft, not asserting authorship of
 * anything, so the timestamp stays null and the record remains freely
 * regenerable. Claiming ownership there would lock a record on the strength of a
 * draft the user rejected.
 */
export async function deleteSnippet(recordId: string): Promise<SnippetWrite> {
  const db = getDb();

  const updated = await db
    .update(records)
    .set({ snippet: null })
    .where(eq(records.id, recordId))
    .returning({ id: records.id, snippetEditedAt: records.snippetEditedAt });

  return updated.length > 0 ? { ok: true } : { ok: false, reason: 'not_found' };
}

/**
 * The artist and title of a record — **and nothing else**, deliberately.
 *
 * This is §10b's "never contradicts entered data" as an ENFORCED property rather
 * than an instructed one: the model cannot contradict a year, a price, a
 * pressing or a catalogue number it was never given. Every column this query
 * omits is a fact that cannot come back wrong.
 *
 * It lives here rather than in `records.ts` so the withholding decision sits
 * beside the rule it implements. A general-purpose record fetch would return
 * everything and leave each caller to remember what not to send, which is the
 * `select *` hazard `collection-summary.ts` documents for §9.2's payload.
 *
 * Returns null when the record does not exist, so the route can 404 before
 * spending anything.
 */
export async function findRecordSubject(
  recordId: string,
): Promise<{ artist: string; title: string } | null> {
  const db = getDb();

  const found = await db
    .select({ artist: artists.name, title: records.title })
    .from(records)
    .innerJoin(artists, eq(artists.id, records.artistId))
    .where(eq(records.id, recordId));

  return found[0] ?? null;
}
