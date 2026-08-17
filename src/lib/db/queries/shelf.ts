import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/**
 * SPEC.md §10b's shelf: the collection as ONE continuous wall of spines.
 *
 * "Records stand as spines on one continuous shelf, ordered by genre so related
 * records stand together — all the punk adjacent, all the rock adjacent."
 *
 * **No sections, and that is a correction rather than a simplification.** An
 * earlier version of this returned genre sections, each rendering its own
 * heading and shelf band. It was correct and it looked broken: the real
 * collection has six genres for five records and every one is top-level, so it
 * produced five near-empty black bands stacked down the page. §10b was amended
 * — "adjacency does the grouping, as it does on a real shelf and in the
 * reference this borrows from, which shows 1,300 spines with no headings at
 * all."
 *
 * **The ORDERING survived the sections**, which is the point: "all the punk
 * together" is a sentence about adjacency, and ordering by top-level genre
 * delivers it without a heading. UK82 and US Hardcore stand next to each other
 * because both are Punk, while staying distinct on the record and in every
 * filter — §8 forbids flattening those scenes and this does not flatten them.
 *
 * Same rule and tie-break §8.1's graph used to colour an artist, deliberately:
 * two screens ordering one collection by different genre logic would disagree
 * about what belongs beside what.
 *
 * **Owned records only**, as §8.1 scoped the graph. A want-list item is a
 * record you do not have, and standing it among the ones you do makes the wall
 * a claim about something else.
 */

export type ShelfRecord = {
  id: string;
  title: string;
  artistName: string;
  /** §10b: hover names artist, title, year and label. */
  releaseYear: number | null;
  labelName: string | null;
  /** §10b: "the catalogue number is the collector's identifier and earns its space." */
  catalogNumber: string | null;
  /** §10b's spine colour; `null` is an honest absence, rendered as a plain spine. */
  spineColour: string | null;
};

type Row = ShelfRecord & { sectionName: string | null };

export async function shelfRecords(): Promise<ShelfRecord[]> {
  const db = getDb();

  const result = await db.execute<Row>(sql`
    /**
     * Every genre mapped to the ROOT of its chain.
     *
     * Walks upward from each genre, carrying the starting id so the final
     * SELECT can join back on it. \`depth\` bounds the walk: \`parent_genre_id\`
     * has no cycle constraint (the guard is at the application layer, §4.1), so
     * a -> b -> a is storable and an unbounded recursion would hang the request
     * rather than return a wrong answer. Sixteen is far past any real genre
     * tree and cheap to pay.
     */
    WITH RECURSIVE chain AS (
      SELECT g.id AS genre_id, g.id AS current_id, g.parent_genre_id, 0 AS depth
      FROM genres g
      UNION ALL
      SELECT c.genre_id, g.id, g.parent_genre_id, c.depth + 1
      FROM chain c
      JOIN genres g ON g.id = c.parent_genre_id
      WHERE c.depth < 16
    ),
    root AS (
      -- The deepest hop for each starting genre is the top of its chain.
      SELECT DISTINCT ON (genre_id) genre_id, current_id AS root_id
      FROM chain
      ORDER BY genre_id, depth DESC
    ),
    /**
     * One section per record.
     *
     * A record may carry several genres and a spine occupies ONE position on a
     * shelf, so exactly one root wins. \`DISTINCT ON (rg.record_id)\` with
     * \`ORDER BY root_name\` makes that the alphabetically-first top-level
     * ancestor — arbitrary, but STABLE, which is what matters: §8.2's
     * determinism rule outlived the feature it was written for, and a wall that
     * reshuffles between loads cannot be used to find a record by eye.
     *
     * It is also the tie-break §8.1's colour walk uses, so the two agree.
     */
    section AS (
      SELECT DISTINCT ON (rg.record_id)
        rg.record_id,
        r.root_id,
        rg2.name AS root_name
      FROM record_genres rg
      JOIN root r ON r.genre_id = rg.genre_id
      JOIN genres rg2 ON rg2.id = r.root_id
      ORDER BY rg.record_id, rg2.name, r.root_id
    )
    SELECT
      rec.id,
      rec.title,
      a.name AS "artistName",
      rec.release_year AS "releaseYear",
      l.name AS "labelName",
      p.catalog_number AS "catalogNumber",
      rec.spine_colour AS "spineColour",
      s.root_name AS "sectionName"
    FROM records rec
    JOIN artists a ON a.id = rec.artist_id
    LEFT JOIN labels l ON l.id = rec.label_id
    LEFT JOIN pressings p ON p.id = rec.pressing_id
    LEFT JOIN section s ON s.record_id = rec.id
    /**
     * Genre groups alphabetically, with ungrouped records LAST — they are the
     * leftovers, and scattering them through the wall would break the adjacency
     * the ordering exists to create.
     *
     * Within a section: artist, then year, then title. That is how a shelf is
     * actually filed — an artist's records together, oldest first — and title
     * breaks a tie so two records of one year have a stable order rather than
     * the database's.
     *
     * \`NULLS LAST\` on the year is absent-not-zero: sorting NULL as 0 would file
     * every undated record in front of ones genuinely older, asserting a date
     * nobody entered.
     */
    ORDER BY
      (s.root_name IS NULL),
      s.root_name,
      a.name,
      rec.release_year NULLS LAST,
      rec.title,
      rec.id
  `);

  /**
   * A flat list in shelf order. `sectionName` did the ordering in SQL and is
   * dropped here — it is not shown, and returning it would invite a caller to
   * render the headings §10b removed.
   */
  return result.rows.map((row) => ({
    id: row.id,
    title: row.title,
    artistName: row.artistName,
    releaseYear: row.releaseYear,
    labelName: row.labelName,
    catalogNumber: row.catalogNumber,
    spineColour: row.spineColour,
  }));
}
