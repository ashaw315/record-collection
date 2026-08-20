import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/**
 * SPEC.md §9.2's "compact summary of the collection", and the answer to R5's
 * first attack line: **field by field, not "a summary"**.
 *
 * **What is sent** — and nothing else:
 *
 * | Field | Why §9.2 needs it |
 * |---|---|
 * | artist name | the model cannot reason about a collection without names |
 * | genre names per artist | §9.2's "owned artists grouped by genre" |
 * | record count per artist | separates a passing interest from a deep run |
 * | label name + count | §9.2's "label counts" |
 * | want-list title, artist, priority | §9.2's "want list with priorities" |
 * | the genre vocabulary | A29d validates the response's `genre` against it |
 *
 * **What is excluded, by name:** `purchase_price`, `purchase_date`, store names,
 * `max_price`, `journal_entries`, `notes` on any table, `matrix_runout`,
 * condition grades, `best_dig_notes`, all `price_history`, all `images`, every
 * uuid, and `discogs_release_id`.
 *
 * The test is Adam's: would he paste this into a public forum? Artist and genre
 * names, yes — that is what a collector posts. What he paid, where he was and on
 * what date, no. `best_dig_notes` and journal entries are his own words about
 * his own records, written for nobody. `max_price` is a negotiating position.
 *
 * Two that are arguably harmless and still excluded: condition grades and
 * `year_pressed`. §9.2 asks for gap analysis — what is MISSING — so they fail
 * the "is it needed" test before reaching the "is it sensitive" one.
 *
 * **Every query below names its columns.** A `select *` would put the exclusion
 * one schema change away from breaking, with only the sentinel test between a
 * new column and the network.
 */

export type CollectionSummary = {
  artists: Array<{ name: string; recordCount: number; genres: string[] }>;
  labels: Array<{ name: string; recordCount: number }>;
  wantList: Array<{ artist: string; title: string; priority: number }>;
  /** Every genre name the user has, for A29d's validation and the prompt. */
  genreVocabulary: string[];
};

export async function buildCollectionSummary(): Promise<CollectionSummary> {
  const db = getDb();

  /*
   * `COUNT(DISTINCT r.id)`, because the genre join multiplies rows: a record
   * tagged UK82 and D-beat is two rows and one record. Telling the model an
   * artist has four records when they have two makes it reason about a
   * collection that does not exist — `genreRollup` documents the same hazard
   * for facet counts, and this is a second consumer of it.
   *
   * Genres are aggregated per artist from what their OWNED records carry, which
   * is §9.2's "owned artists grouped by genre". Not `artist_genres`: that table
   * has never held a row (§4.3).
   */
  const artistRows = await db.execute<{
    name: string;
    record_count: number;
    genres: string[] | null;
  }>(sql`
    SELECT
      a.name,
      COUNT(DISTINCT r.id)::int AS record_count,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT g.name), NULL) AS genres
    FROM records r
    JOIN artists a ON a.id = r.artist_id
    LEFT JOIN record_genres rg ON rg.record_id = r.id
    LEFT JOIN genres g ON g.id = rg.genre_id
    GROUP BY a.name
    ORDER BY COUNT(DISTINCT r.id) DESC, a.name
  `);

  /*
   * §9.2's "label counts". Every label with an owned record, not only those
   * appearing twice — that threshold is §9.1's scoring rule, and applying it
   * here would hide a label the model could legitimately reason about.
   */
  const labelRows = await db.execute<{ name: string; record_count: number }>(sql`
    SELECT l.name, COUNT(*)::int AS record_count
    FROM records r
    JOIN labels l ON l.id = r.label_id
    GROUP BY l.name
    ORDER BY COUNT(*) DESC, l.name
  `);

  /*
   * Unacquired items only. §7.3 makes the want list double as acquisition
   * history, and an acquired row is a record the user OWNS — offering it as a
   * gap would recommend something already on the shelf.
   */
  const wantRows = await db.execute<{ artist: string; title: string; priority: number }>(sql`
    SELECT a.name AS artist, w.title, w.priority
    FROM want_list w
    JOIN artists a ON a.id = w.artist_id
    WHERE w.is_acquired = false
    ORDER BY w.priority ASC, a.name, w.title
  `);

  /*
   * The whole vocabulary, including genres nothing is tagged with yet: the user
   * created them, so they are part of how this collection is organised, and
   * A29d validates the response against exactly this list.
   */
  const genreRows = await db.execute<{ name: string }>(sql`
    SELECT name FROM genres ORDER BY name
  `);

  return {
    artists: artistRows.rows.map((row) => ({
      name: row.name,
      recordCount: row.record_count,
      genres: row.genres ?? [],
    })),
    labels: labelRows.rows.map((row) => ({ name: row.name, recordCount: row.record_count })),
    wantList: wantRows.rows.map((row) => ({
      artist: row.artist,
      title: row.title,
      priority: row.priority,
    })),
    genreVocabulary: genreRows.rows.map((row) => row.name),
  };
}
