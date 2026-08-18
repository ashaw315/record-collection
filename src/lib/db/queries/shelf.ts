import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { buildWhere, type RecordFilters } from './records';

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

  /**
   * §10b's pulled record: front cover, back, and the fields the back face
   * composes from when no photograph exists.
   *
   * All of it travels with the spines rather than being fetched when a record
   * is pulled — on a wall of three hundred, a fetch-per-pull is three hundred
   * possible requests on a screen whose point is immediacy.
   */
  coverUrl: string | null;
  backUrl: string | null;
  /**
   * §10b as amended by A21c: the hinge "exists only where BOTH leaves have been
   * photographed. One is not enough: a hinge that opens onto artwork on one
   * side and a blank on the other invents exactly the thing the user came to
   * see."
   *
   * Two fields rather than one, so the half-photographed record is
   * representable. A single url could not distinguish "both leaves" from "one
   * leaf", and the affordance rule turns on exactly that difference.
   */
  gatefoldLeftUrl: string | null;
  gatefoldRightUrl: string | null;

  matrixRunout: string | null;
  yearPressed: number | null;
  countryPressed: string | null;
  pressingPlant: string | null;
  vinylWeightGrams: number | null;
  colorVariant: string | null;
  isReissue: boolean;
  conditionMedia: string | null;
  conditionSleeve: string | null;
  purchasePrice: string | null;
  purchaseDate: string | null;
  storeName: string | null;
};

type Row = ShelfRecord & { sectionName: string | null };

/**
 * §10b's wall.
 *
 * **Filtered by the SAME predicate the table uses**, and that is a defect fix
 * rather than a feature. This function took no arguments: filtering to a genre
 * rendered every spine in the collection under a heading showing the FILTERED
 * count — five spines beneath "2 records", with the chip lit and "Clear filter"
 * offered. A user would believe they owned five Rock records. That is the
 * confidently-misleading class CLAUDE.md §8 is about, on the screen they see
 * first, and it survived from unit 6 to unit 20 because no test asserted the
 * wall honours a filter.
 *
 * `buildWhere` is exported from `records.ts` and reused rather than restated.
 * Drizzle's `sql` objects compose into raw templates, so the CONDITIONS travel
 * even though this query's shape — two recursive CTEs, three `DISTINCT ON`
 * clauses — has no clean Drizzle expression and is not worth rewriting to
 * share them. The table is aliased as `records` rather than `rec` precisely so
 * those conditions resolve: Drizzle renders `"records"."label_id"`, which would
 * reference a table not in scope under any other alias.
 *
 * **Filtering repacks rather than leaving gaps**, which is honest but is not
 * what §10b A24d asks for. That behaviour is unimplemented and has its own unit
 * ahead of it; holding positions for records that are not rendered is a
 * different mechanism from filtering the rows.
 */
export async function shelfRecords(filters: RecordFilters = {}): Promise<ShelfRecord[]> {
  const db = getDb();
  const where = buildWhere(filters);

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
    ),
    /**
     * One image per type per record, OLDEST first.
     *
     * DISTINCT ON rather than a plain join: a record with three images would
     * otherwise appear three times, putting three spines on the wall — the same
     * fan-out the multi-genre join has, one table over.
     *
     * Oldest wins, matching the gallery's "the first upload stays first". If
     * the two disagreed, the front of a pulled record would differ from the
     * first image of its own gallery.
     */
    image AS (
      SELECT DISTINCT ON (record_id, image_type) record_id, image_type, url
      FROM images
      WHERE image_type IN ('cover', 'back', 'gatefold_left', 'gatefold_right')
      ORDER BY record_id, image_type, created_at ASC, id
    )
    SELECT
      records.id,
      records.title,
      a.name AS "artistName",
      records.release_year AS "releaseYear",
      l.name AS "labelName",
      p.catalog_number AS "catalogNumber",
      records.spine_colour AS "spineColour",
      cover.url AS "coverUrl",
      back.url AS "backUrl",
      gateL.url AS "gatefoldLeftUrl",
      gateR.url AS "gatefoldRightUrl",
      p.matrix_runout AS "matrixRunout",
      p.year_pressed AS "yearPressed",
      p.country_pressed AS "countryPressed",
      p.pressing_plant AS "pressingPlant",
      p.vinyl_weight_grams AS "vinylWeightGrams",
      p.color_variant AS "colorVariant",
      COALESCE(p.is_reissue, false) AS "isReissue",
      records.condition_media::text AS "conditionMedia",
      records.condition_sleeve::text AS "conditionSleeve",
      records.purchase_price::text AS "purchasePrice",
      records.purchase_date::text AS "purchaseDate",
      st.name AS "storeName",
      s.root_name AS "sectionName"
    FROM records
    JOIN artists a ON a.id = records.artist_id
    LEFT JOIN labels l ON l.id = records.label_id
    LEFT JOIN pressings p ON p.id = records.pressing_id
    LEFT JOIN record_stores st ON st.id = records.store_id
    LEFT JOIN image cover ON cover.record_id = records.id AND cover.image_type = 'cover'
    LEFT JOIN image back  ON back.record_id  = records.id AND back.image_type  = 'back'
    LEFT JOIN image gateL ON gateL.record_id = records.id AND gateL.image_type = 'gatefold_left'
    LEFT JOIN image gateR ON gateR.record_id = records.id AND gateR.image_type = 'gatefold_right'
    LEFT JOIN section s ON s.record_id = records.id
    ${where === undefined ? sql`` : sql`WHERE ${where}`}
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
      records.release_year NULLS LAST,
      records.title,
      records.id
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
    coverUrl: row.coverUrl,
    backUrl: row.backUrl,
    gatefoldLeftUrl: row.gatefoldLeftUrl,
    gatefoldRightUrl: row.gatefoldRightUrl,
    matrixRunout: row.matrixRunout,
    yearPressed: row.yearPressed,
    countryPressed: row.countryPressed,
    pressingPlant: row.pressingPlant,
    vinylWeightGrams: row.vinylWeightGrams,
    colorVariant: row.colorVariant,
    isReissue: row.isReissue,
    conditionMedia: row.conditionMedia,
    conditionSleeve: row.conditionSleeve,
    purchasePrice: row.purchasePrice,
    purchaseDate: row.purchaseDate,
    storeName: row.storeName,
  }));
}
