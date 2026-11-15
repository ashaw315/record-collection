import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { recordMatchedText } from '@/db/schema';

/**
 * **SPEC §4.6: the only writer of a record's generated matched text.** It writes `generated`, `generated_model` and
 * `generated_at`, and nothing else, so an edit Adam has made outlives every regeneration. A blank is NULL with no model
 * or time, so "unknown" has one form and the record stays ineligible for the pick.
 */
export async function storeGeneratedMatchedText(recordId: string, text: string | null, model: string): Promise<void> {
  const generated = text === null || text.trim() === '' ? null : text.trim();
  const values = { recordId, generated, generatedModel: generated === null ? null : model, generatedAt: generated === null ? null : new Date() };
  await getDb()
    .insert(recordMatchedText)
    .values(values)
    .onConflictDoUpdate({
      target: recordMatchedText.recordId,
      set: { generated: sql`excluded.generated`, generatedModel: sql`excluded.generated_model`, generatedAt: sql`excluded.generated_at` },
    });
}

export type DraftRow = { id: string; artist: string; title: string; year: number | null; about: string | null; payload: unknown };

/**
 * **The records the drafting script drafts (scripts/write-matched-text.mts):** by short id prefix, or every record with
 * no matched text, generated or edited. Each with what the prompt needs: artist, title, the album's year, the ABOUT as
 * context, and the cached Discogs payload, or null where none is cached. The prefixes go as one array parameter: its
 * first form, `= ANY((…))`, was a row constructor, which failed the script's first real run (42809) before any call.
 */
export async function recordsToDraft(selection: { prefixes: readonly string[] } | 'all'): Promise<DraftRow[]> {
  /*
    One array parameter. Drizzle expands a JavaScript array into one parameter per element, so `ANY(${array})` is a row
    constructor again; the array goes as one Postgres array literal, `{a,b}`, its elements checked as hex first so
    nothing else can enter the literal.
  */
  if (selection !== 'all') {
    const bad = selection.prefixes.find((p) => !/^[0-9a-f]{1,8}$/.test(p));
    if (bad !== undefined) throw new Error(`recordsToDraft: "${bad}" is not a short id`);
  }
  const where = selection === 'all'
    ? sql`m.generated IS NULL AND m.edited IS NULL`
    : sql`left(r.id::text, 8) = ANY(${`{${selection.prefixes.join(',')}}`}::text[])`;
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
