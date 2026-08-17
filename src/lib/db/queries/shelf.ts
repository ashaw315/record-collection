import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/**
 * SPEC.md §10b's shelf: the collection as a wall of spines, in sections.
 *
 * "Records stand as spines, ordered by genre so the shelf reads as sections:
 * all the punk together, all the rock together. **That ordering is the shelf's
 * own, not a proposal for the physical one.**"
 *
 * **Sections are TOP-LEVEL genres, not the genres a record carries**, and that
 * is the whole design. UK82 and US Hardcore are different scenes — §8 forbids
 * flattening them and they stay distinct on the record, in every filter, and in
 * §7.1's hierarchy. They stand TOGETHER on the shelf because both are Punk.
 * Sectioning by the tagged genre would put two shelves of punk at opposite ends
 * of the wall, which is the opposite of what §10b asks for.
 *
 * Same rule §8.1's graph used to colour an artist, deliberately: two screens
 * grouping one collection by different genre logic would disagree about what
 * belongs together.
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

export type ShelfSection = {
  /** `null` for the leftovers bucket — it is not a real genre. */
  genreId: string | null;
  label: string;
  records: ShelfRecord[];
};

type Row = ShelfRecord & { sectionId: string | null; sectionName: string | null };

export async function shelfRecords(): Promise<ShelfSection[]> {
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
      s.root_id AS "sectionId",
      s.root_name AS "sectionName"
    FROM records rec
    JOIN artists a ON a.id = rec.artist_id
    LEFT JOIN labels l ON l.id = rec.label_id
    LEFT JOIN pressings p ON p.id = rec.pressing_id
    LEFT JOIN section s ON s.record_id = rec.id
    /**
     * Sections alphabetically, with the ungrouped bucket LAST — it is the
     * leftovers, and a section called "No genre" sorted into the middle of the
     * wall would read as a genre.
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

  const sections: ShelfSection[] = [];

  for (const row of result.rows) {
    const label = row.sectionName ?? 'No genre';
    const last = sections[sections.length - 1];

    // The query already groups them, so a new section starts only when the
    // label changes — no map, no second sort, and the order above is preserved
    // exactly as SQL produced it.
    if (last === undefined || last.label !== label) {
      sections.push({ genreId: row.sectionId, label, records: [] });
    }

    sections[sections.length - 1].records.push({
      id: row.id,
      title: row.title,
      artistName: row.artistName,
      releaseYear: row.releaseYear,
      labelName: row.labelName,
      catalogNumber: row.catalogNumber,
      spineColour: row.spineColour,
    });
  }

  return sections;
}
