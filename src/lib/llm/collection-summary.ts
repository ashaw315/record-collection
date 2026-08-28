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
 * | each genre's parent | the hierarchy A29d says the prompt supplies (R5's F2) |
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
  /**
   * Owned artists, with the TITLES they own (A41, 2026-08-26).
   *
   * **Titles were withheld until A41 and their absence was the defect.** A29g
   * made "already owned" an artist-level rule precisely because titles were not
   * sent — then asked the model to lead with ownership reasoning anyway, which
   * produced "Miles Davis — Bitches Brew" twice in two runs against a
   * collection that contains it.
   *
   * A rule the payload cannot support is either enforced by data or dropped
   * from the prompt. Dropping it means giving up same-artist suggestions, which
   * is the case A29g deliberately wanted — so the data is sent instead.
   *
   * **The cost is INPUT SIZE, not privacy**, and A29g named the wrong one:
   * ~150 tokens at 17 records, ~2,000 at 200. A38 measured input as the cheap
   * side (1,603–1,738 against outputs of 526–1,210).
   */
  artists: Array<{ name: string; recordCount: number; genres: string[]; titles: string[] }>;
  labels: Array<{ name: string; recordCount: number }>;
  wantList: Array<{ artist: string; title: string; priority: number }>;
  /**
   * Every genre name the user has, for A29d's validation.
   *
   * **Parents included.** A collection that tags records at a parent term must
   * still validate — the vocabulary is "the user's own genre names", and a
   * parent is one of those.
   */
  genreVocabulary: string[];
  /**
   * The same genres WITH their structure, for the prompt (R5's F2).
   *
   * A29d says "the prompt supplies the collection's genre hierarchy", and until
   * this existed it supplied a comma-separated list — instructing the model not
   * to flatten a scene into a parent term without telling it which terms were
   * parents.
   *
   * `parent` is the parent's NAME rather than its id: nothing downstream
   * resolves ids, and §9.2 sends no identifiers at all.
   */
  genres: Array<{ name: string; parent: string | null }>;
};

/**
 * @param options.genreId — scope the summary to one genre AND EVERYTHING BENEATH
 * IT (A45), or omit for the whole collection.
 *
 * **The subtree walk is not optional.** `Punk` carries no records of its own and
 * gains through `UK82`, so a direct-only scope would send an empty collection
 * for exactly the genre the drill-down exists to answer — and it must walk the
 * SAME recursion the staleness count does, or the answer disagrees with its own
 * scope.
 */
export async function buildCollectionSummary(options?: {
  genreId?: string | null;
}): Promise<CollectionSummary> {
  const db = getDb();
  const scope = options?.genreId ?? null;

  /*
   * The scoped record set, as a CTE reused by every query below — one definition
   * of "in scope", so the artists, labels and want list cannot drift apart.
   */
  const inScope = scope === null ? sql`TRUE` : sql`r.id IN (SELECT id FROM scoped)`;
  const subtree =
    scope === null
      ? sql``
      : sql`
          WITH RECURSIVE tree AS (
            SELECT id FROM genres WHERE id = ${scope}
            UNION
            SELECT g.id FROM genres g JOIN tree t ON g.parent_genre_id = t.id
          ),
          scoped AS (
            SELECT DISTINCT r.id
              FROM records r
              JOIN record_genres rg ON rg.record_id = r.id
             WHERE rg.genre_id IN (SELECT id FROM tree)
          )
        `;

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
    titles: string[] | null;
  }>(sql`
    ${subtree}
    SELECT
      a.name,
      COUNT(DISTINCT r.id)::int AS record_count,
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT g.name), NULL) AS genres,
      -- A41: the titles themselves, so "already owned" is checkable at record
      -- level the way the want-list prohibition already is.
      ARRAY_REMOVE(ARRAY_AGG(DISTINCT r.title), NULL) AS titles
    FROM records r
    JOIN artists a ON a.id = r.artist_id
    LEFT JOIN record_genres rg ON rg.record_id = r.id
    LEFT JOIN genres g ON g.id = rg.genre_id
    WHERE ${inScope}
    GROUP BY a.name
    ORDER BY COUNT(DISTINCT r.id) DESC, a.name
  `);

  /*
   * §9.2's "label counts". Every label with an owned record, not only those
   * appearing twice — that threshold is §9.1's scoring rule, and applying it
   * here would hide a label the model could legitimately reason about.
   */
  const labelRows = await db.execute<{ name: string; record_count: number }>(sql`
    ${subtree}
    SELECT l.name, COUNT(*)::int AS record_count
    FROM records r
    JOIN labels l ON l.id = r.label_id
    WHERE ${inScope}
    GROUP BY l.name
    ORDER BY COUNT(*) DESC, l.name
  `);

  /*
   * Unacquired items only. §7.3 makes the want list double as acquisition
   * history, and an acquired row is a record the user OWNS — offering it as a
   * gap would recommend something already on the shelf.
   */
  /*
   * **Scoped through `want_list_genres`, not through `records`** — a want-list
   * row has no record yet, so it carries its own genre links and needs its own
   * predicate. A29g's record-level prohibition is only useful if it names rows
   * in the scope; sending the whole want list to a UK82 question spends tokens
   * on rows the answer cannot be about.
   */
  const wantInScope =
    scope === null
      ? sql`TRUE`
      : sql`EXISTS (
          SELECT 1 FROM want_list_genres wg
           WHERE wg.want_list_id = w.id AND wg.genre_id IN (SELECT id FROM tree)
        )`;

  const wantRows = await db.execute<{ artist: string; title: string; priority: number }>(sql`
    ${scope === null ? sql`` : sql`
      WITH RECURSIVE tree AS (
        SELECT id FROM genres WHERE id = ${scope}
        UNION
        SELECT g.id FROM genres g JOIN tree t ON g.parent_genre_id = t.id
      )
    `}
    SELECT a.name AS artist, w.title, w.priority
    FROM want_list w
    JOIN artists a ON a.id = w.artist_id
    WHERE w.is_acquired = false AND ${wantInScope}
    ORDER BY w.priority ASC, a.name, w.title
  `);

  /*
   * The whole vocabulary, including genres nothing is tagged with yet: the user
   * created them, so they are part of how this collection is organised, and
   * A29d validates the response against exactly this list.
   *
   * **With the parent's NAME, which is R5's F2.** A self-join rather than a
   * recursive CTE: each genre needs its immediate parent, not its ancestry, and
   * `genreSubtree`'s recursion answers a different question (every descendant of
   * one node). Rendering the tree from parent links is the prompt's job.
   */
  const genreRows = await db.execute<{ name: string; parent: string | null }>(sql`
    SELECT g.name, p.name AS parent
    FROM genres g
    LEFT JOIN genres p ON p.id = g.parent_genre_id
    ORDER BY g.name
  `);

  return {
    artists: artistRows.rows.map((row) => ({
      name: row.name,
      recordCount: row.record_count,
      genres: row.genres ?? [],
      titles: row.titles ?? [],
    })),
    labels: labelRows.rows.map((row) => ({ name: row.name, recordCount: row.record_count })),
    wantList: wantRows.rows.map((row) => ({
      artist: row.artist,
      title: row.title,
      priority: row.priority,
    })),
    genreVocabulary: genreRows.rows.map((row) => row.name),
    genres: genreRows.rows.map((row) => ({ name: row.name, parent: row.parent })),
  };
}
