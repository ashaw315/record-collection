import 'server-only';
import { and, asc, desc, eq, exists, gte, ilike, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { escapeLikePattern } from '@/lib/api/like';
import type { RecordFilters, RecordSortField } from '@/lib/records/fields';
import { countReferences } from './referrers';
// §7.1's hierarchy, shared with ./want-list and ./shelf — see that module for
// why it is not defined here.
import { genreSubtree } from './genre-hierarchy';
import { getDb } from '@/db/client';
import {
  artists,
  formats,
  genres,
  images,
  journalEntries,
  labels,
  pressings,
  priceHistory,
  recordGenres,
  recordStores,
  recordTags,
  records,
  tags,
} from '@/db/schema';

/**
 * The query layer for `records` (SPEC.md §5.2).
 *
 * Two departures from every reference resource built so far:
 *
 *   - There is NO unique constraint on (artist_id, title) and there must be no
 *     duplicate check. §4 states duplicates are legal and expected — a
 *     collector may own two copies of the same album in different pressings or
 *     conditions — so a copied duplicate pre-check would reject valid data.
 *   - Creation goes through the transactional primitive in ./nested, because
 *     the parent and its junction rows must land together.
 */

export type RecordRow = typeof records.$inferSelect;

type Named = { id: string; name: string };

export type HydratedRecord = RecordRow & {
  artist: Named;
  label: Named | null;
  format: Named | null;
  store: Named | null;
  pressing: typeof pressings.$inferSelect | null;
  genres: Named[];
  tags: Named[];
  images: (typeof images.$inferSelect)[];
  journalEntries: (typeof journalEntries.$inferSelect)[];
  latestPrice: typeof priceHistory.$inferSelect | null;
};

/**
 * Sets §10b's spine colour, and ONLY when the record has none.
 *
 * **Gap-fill, not overwrite** (§7.8). A spine computed from a sleeve the user
 * photographed must survive a later Discogs re-import — the colour is derived
 * from a cover, and the user's cover is the authoritative one. The guard lives
 * here rather than at each call site so a third writer cannot forget it.
 *
 * `null` is a legitimate stored value meaning "no cover, so no colour", and
 * this deliberately treats it as ABSENT rather than as a decision: a record
 * whose first cover failed to decode should get a colour when a readable one
 * arrives.
 */
export async function setSpineColourIfUnset(recordId: string, colour: string): Promise<void> {
  const db = getDb();

  await db
    .update(records)
    .set({ spineColour: colour })
    .where(and(eq(records.id, recordId), isNull(records.spineColour)));
}

export async function findRecordById(id: string): Promise<RecordRow | undefined> {
  const db = getDb();
  const [row] = await db.select().from(records).where(eq(records.id, id)).limit(1);
  return row;
}

/**
 * The §5.2 detail read: the record with every relation resolved.
 *
 * Relations are fetched as SEPARATE queries rather than one wide join.
 *
 * A single join across two junction tables multiplies rows — a record with 3
 * genres and 2 tags returns 6 rows — and collapsing that back requires grouping
 * that is easy to get subtly wrong, in a way that shows ANOTHER record's genres
 * on this one. Several small indexed queries are cheaper to reason about, and
 * the fan-out cannot happen at all. There is a test asserting one record never
 * shows another's relations.
 */
export async function hydrateRecord(id: string): Promise<HydratedRecord | undefined> {
  const db = getDb();

  const [record] = await db.select().from(records).where(eq(records.id, id)).limit(1);
  if (record === undefined) return undefined;

  const [artist] = await db
    .select({ id: artists.id, name: artists.name })
    .from(artists)
    .where(eq(artists.id, record.artistId))
    .limit(1);

  const label =
    record.labelId === null
      ? null
      : ((
          await db
            .select({ id: labels.id, name: labels.name })
            .from(labels)
            .where(eq(labels.id, record.labelId))
            .limit(1)
        )[0] ?? null);

  const format =
    record.formatId === null
      ? null
      : ((
          await db
            .select({ id: formats.id, name: formats.name })
            .from(formats)
            .where(eq(formats.id, record.formatId))
            .limit(1)
        )[0] ?? null);

  const store =
    record.storeId === null
      ? null
      : ((
          await db
            .select({ id: recordStores.id, name: recordStores.name })
            .from(recordStores)
            .where(eq(recordStores.id, record.storeId))
            .limit(1)
        )[0] ?? null);

  const pressing =
    record.pressingId === null
      ? null
      : ((
          await db
            .select()
            .from(pressings)
            .where(eq(pressings.id, record.pressingId))
            .limit(1)
        )[0] ?? null);

  const recordGenreRows = await db
    .select({ id: genres.id, name: genres.name })
    .from(recordGenres)
    .innerJoin(genres, eq(genres.id, recordGenres.genreId))
    .where(eq(recordGenres.recordId, id))
    .orderBy(genres.name, genres.id);

  const recordTagRows = await db
    .select({ id: tags.id, name: tags.name })
    .from(recordTags)
    .innerJoin(tags, eq(tags.id, recordTags.tagId))
    .where(eq(recordTags.recordId, id))
    .orderBy(tags.name, tags.id);

  const imageRows = await db
    .select()
    .from(images)
    .where(eq(images.recordId, id))
    .orderBy(images.createdAt, images.id);

  const journalRows = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.recordId, id))
    .orderBy(desc(journalEntries.entryDate), journalEntries.id);

  /**
   * "Latest price" means the most recent row, whatever its type.
   *
   * NOT §7.6's used → new → purchase_price chain: that is defined for the
   * ESTIMATED COLLECTION VALUE aggregate and belongs to the stats endpoint.
   * Applying it here would show the user a different number from the one they
   * just recorded.
   */
  const [latestPrice] = await db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.recordId, id))
    .orderBy(desc(priceHistory.recordedAt), desc(priceHistory.id))
    .limit(1);

  return {
    ...record,
    artist,
    label,
    format,
    store,
    pressing,
    genres: recordGenreRows,
    tags: recordTagRows,
    images: imageRows,
    journalEntries: journalRows,
    latestPrice: latestPrice ?? null,
  };
}

/**
 * Which of the supplied ids do not exist, so the handler can name the field
 * rather than letting a foreign-key violation surface as a 500.
 *
 * Filtered in SQL with `inArray` rather than by fetching every row and
 * comparing in JS — the naive version reads the whole table to validate three
 * ids, which is fine with six genres and not with six hundred.
 */
export async function missingIds(table: 'genres' | 'tags', ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const db = getDb();

  const found =
    table === 'genres'
      ? await db.select({ id: genres.id }).from(genres).where(inArray(genres.id, ids))
      : await db.select({ id: tags.id }).from(tags).where(inArray(tags.id, ids));

  const present = new Set(found.map((row) => row.id));
  return ids.filter((id) => !present.has(id));
}

/**
 * The §5.2 sortable fields and filter shape are DEFINED in @/lib/records/fields
 * and re-exported here, so existing importers are unaffected.
 *
 * They moved because the collection screen's filter controls are a client
 * component and need the same allowlist; this module is `server-only`, so
 * importing it from the client would fail the build. Two copies would drift,
 * and the one that drifts is the one that stops rejecting something.
 */
export { RECORD_SORT_FIELDS } from '@/lib/records/fields';
export type { RecordSortField, RecordFilters } from '@/lib/records/fields';

/**
 * Builds the WHERE clause.
 *
 * Every filter is a separate condition ANDed together by `and(...)`. The `q`
 * clause is internally an OR (title OR artist), and it is passed to `and(...)`
 * as ONE grouped condition — Drizzle parenthesises it, so the OR cannot escape
 * and widen the result. That precedence error is the defect this endpoint is
 * most likely to hide: it returns MORE rows than asked for, which reads as "the
 * filter did nothing" rather than as an error.
 *
 * Junction filters use EXISTS rather than a join, so a record with three genres
 * is not returned three times — the row-multiplication problem the detail read
 * avoids for the same reason.
 */
function buildWhere(filters: RecordFilters) {
  const clauses = [];

  if (filters.artistId !== undefined) clauses.push(eq(records.artistId, filters.artistId));
  if (filters.labelId !== undefined) clauses.push(eq(records.labelId, filters.labelId));
  if (filters.formatId !== undefined) clauses.push(eq(records.formatId, filters.formatId));
  if (filters.storeId !== undefined) clauses.push(eq(records.storeId, filters.storeId));
  if (filters.condition !== undefined) clauses.push(eq(records.conditionMedia, filters.condition));
  /**
   * §5.2's `includeUndated`. The year bounds are built as ONE grouped
   * condition, then optionally ORed with `release_year IS NULL`.
   *
   * The grouping is the whole point: `(from AND to) OR NULL` is right, while
   * `from AND (to OR NULL)` would let a 1972 record through a 1980 floor.
   * §5.2 forbids nulls satisfying the range predicate itself, and that is the
   * shape in which it would silently happen.
   */
  const yearClauses = [];
  if (filters.yearFrom !== undefined) yearClauses.push(gte(records.releaseYear, filters.yearFrom));
  if (filters.yearTo !== undefined) yearClauses.push(lte(records.releaseYear, filters.yearTo));

  if (yearClauses.length > 0) {
    const inRange = and(...yearClauses);
    // Default true (§5.2): a year filter must not make records vanish.
    clauses.push(
      filters.includeUndated === false
        ? inRange
        : or(inRange, sql`${records.releaseYear} IS NULL`),
    );
  }

  if (filters.genreId !== undefined) {
    clauses.push(
      exists(
        sql`(SELECT 1 FROM ${recordGenres} rg
              WHERE rg.record_id = ${records.id}
                AND rg.genre_id IN (SELECT id FROM ${genreSubtree(filters.genreId)}))`,
      ),
    );
  }

  if (filters.tagId !== undefined) {
    const tagId = filters.tagId;
    clauses.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(recordTags)
          .where(and(eq(recordTags.recordId, records.id), eq(recordTags.tagId, tagId))),
      ),
    );
  }

  if (filters.q !== undefined && filters.q !== '') {
    const q = filters.q;
    const like = `%${escapeLikePattern(q)}%`;

    /**
     * Trigram OR substring, and both halves are needed — verified against the
     * database rather than assumed:
     *
     *   similarity('hear', 'Hear Nothing See Nothing Say Nothing') = 0.25
     *
     * which is BELOW the default 0.3 threshold, because a short query is
     * diluted by a long title. Trigram alone would return nothing for a real
     * prefix. Conversely 'Notthing' is not a substring of anything, so
     * substring alone would miss the typo the trigram indexes exist for.
     */
    clauses.push(
      or(
        sql`${records.title} % ${q}`,
        ilike(records.title, like),
        exists(
          getDb()
            .select({ one: sql`1` })
            .from(artists)
            .where(
              and(
                eq(artists.id, records.artistId),
                or(sql`${artists.name} % ${q}`, ilike(artists.name, like)),
              ),
            ),
        ),
      ),
    );
  }

  return clauses.length === 0 ? undefined : and(...clauses);
}

/**
 * Resolves a sort field to an orderable expression.
 *
 * `artist` is the field the template's `sortColumns` record cannot express:
 * there is no column on `records` to map it to. It is resolved with a
 * correlated subquery rather than by interpolating a string — the allowlist is
 * EXTENDED, not bypassed, so nothing derived from the request reaches SQL.
 */
function sortExpression(field: RecordSortField) {
  switch (field) {
    case 'artist':
      return sql`(SELECT ${artists.name} FROM ${artists} WHERE ${artists.id} = ${records.artistId})`;
    case 'title':
      return records.title;
    case 'purchaseDate':
      return records.purchaseDate;
    case 'purchasePrice':
      return records.purchasePrice;
    case 'releaseYear':
      return records.releaseYear;
  }
}

export type MatchedVia = {
  filtered: Named;
  descendants: Named[];
};

/** §5.2: list rows carry hydrated names. `pressing` is deliberately absent — it
 * is needed only on the detail read, where hydrateRecord already resolves it. */
export type ListedRecord = RecordRow & {
  artist: Named;
  label: Named | null;
  format: Named | null;
  store: Named | null;
  matchedVia: MatchedVia | null;
};

/**
 * SPEC.md §5.2's `matchedVia`: which of a record's OWN genres fall under the
 * filtered one.
 *
 * Resolved in one query for the whole page rather than per row — the page is
 * already bounded by pageSize, and a query per row is the shape that turns a
 * 50-row page into 51 round trips.
 *
 * Reuses `genreSubtree`, so the explanation cannot disagree with the filter
 * that produced the rows: if these were computed by separate rules, a record
 * could be returned with an empty `descendants`, which §5.2 forbids on a
 * matched row.
 */
async function resolveMatchedVia(
  genreId: string,
  recordIds: string[],
): Promise<{ filtered: Named | undefined; byRecord: Map<string, Named[]> }> {
  const db = getDb();

  const [filtered] = await db
    .select({ id: genres.id, name: genres.name })
    .from(genres)
    .where(eq(genres.id, genreId))
    .limit(1);

  const byRecord = new Map<string, Named[]>();
  if (recordIds.length === 0 || filtered === undefined) return { filtered, byRecord };

  const rows = await db
    .select({
      recordId: recordGenres.recordId,
      id: genres.id,
      name: genres.name,
    })
    .from(recordGenres)
    .innerJoin(genres, eq(genres.id, recordGenres.genreId))
    .where(
      and(
        inArray(recordGenres.recordId, recordIds),
        sql`${recordGenres.genreId} IN (SELECT id FROM ${genreSubtree(genreId)})`,
      ),
    )
    .orderBy(genres.name, genres.id);

  for (const row of rows) {
    const existing = byRecord.get(row.recordId);
    const entry = { id: row.id, name: row.name };
    if (existing === undefined) byRecord.set(row.recordId, [entry]);
    else existing.push(entry);
  }

  return { filtered, byRecord };
}

export async function listRecords(options: {
  limit: number;
  offset: number;
  sort?: { field: RecordSortField; direction: 'asc' | 'desc' };
  filters: RecordFilters;
}): Promise<{ rows: ListedRecord[]; total: number; undatedCount: number }> {
  const db = getDb();
  const where = buildWhere(options.filters);

  const column = sortExpression(options.sort?.field ?? 'title');
  const ordered = options.sort?.direction === 'desc' ? desc(column) : asc(column);

  /**
   * §5.2's hydrated names, resolved with LEFT JOINs on the reference tables.
   *
   * LEFT, not INNER, for the three nullable relations — an INNER join would
   * silently DROP every record without a label, which is a filter disguised as
   * a projection. `artists` is joined the same way even though `artist_id` is
   * NOT NULL: an inner join there would be correct today and would become a
   * silent row-dropper if the column ever went nullable.
   *
   * All four are single-FK joins on indexed columns against a page-bounded
   * set. None is a junction table, so no row multiplication — there is a test
   * asserting a record with several genres still returns once.
   */
  const rows = await db
    .select({
      record: records,
      artistId: artists.id,
      artistName: artists.name,
      labelId: labels.id,
      labelName: labels.name,
      formatId: formats.id,
      formatName: formats.name,
      storeId: recordStores.id,
      storeName: recordStores.name,
    })
    .from(records)
    .leftJoin(artists, eq(artists.id, records.artistId))
    .leftJoin(labels, eq(labels.id, records.labelId))
    .leftJoin(formats, eq(formats.id, records.formatId))
    .leftJoin(recordStores, eq(recordStores.id, records.storeId))
    .where(where)
    // NULLS LAST and the id tiebreaker, for the same reasons as every other
    // list endpoint: Postgres flips null placement between ASC and DESC, and an
    // untied sort loses rows across pages.
    .orderBy(sql`${ordered} NULLS LAST`, asc(records.id))
    .limit(options.limit)
    .offset(options.offset);

  // Counted through the SAME where clause: a count that ignores the filters
  // makes pagination lie about how many pages exist.
  const [totals] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(records)
    .where(where);

  const total = totals?.value ?? 0;

  /**
   * §5.2's `meta.undatedCount`: how many records in the CURRENT FILTER SET have
   * no release year.
   *
   * Counted through the same where clause with the year conditions removed —
   * `whereWithoutYears` — because the count must not depend on the range it is
   * reporting about. Counting through `where` would make it 0 whenever
   * includeUndated=false, which is exactly when the UI most needs the number.
   */
  const [undated] = await db
    .select({ value: sql<number>`count(*)::int` })
    .from(records)
    .where(
      and(
        buildWhere({ ...options.filters, yearFrom: undefined, yearTo: undefined }),
        sql`${records.releaseYear} IS NULL`,
      ),
    );

  const undatedCount = undated?.value ?? 0;

  const hydrate = (row: (typeof rows)[number]) => ({
    ...row.record,
    // artist_id is NOT NULL and the join is on the primary key, so this only
    // falls back if the row were deleted mid-query. Named rather than asserted
    // non-null: CLAUDE.md §6 forbids `!` to silence the compiler.
    artist: { id: row.artistId ?? row.record.artistId, name: row.artistName ?? '' },
    label: row.labelId === null ? null : { id: row.labelId, name: row.labelName ?? '' },
    format: row.formatId === null ? null : { id: row.formatId, name: row.formatName ?? '' },
    store: row.storeId === null ? null : { id: row.storeId, name: row.storeName ?? '' },
  });

  // §5.2: null, not absent, when no genreId filter is applied — so a client
  // never has to branch on whether the key exists.
  if (options.filters.genreId === undefined) {
    return {
      rows: rows.map((row) => ({ ...hydrate(row), matchedVia: null })),
      total,
      undatedCount,
    };
  }

  const { filtered, byRecord } = await resolveMatchedVia(
    options.filters.genreId,
    rows.map((row) => row.record.id),
  );

  return {
    rows: rows.map((row) => ({
      ...hydrate(row),
      matchedVia:
        filtered === undefined
          ? null
          : { filtered, descendants: byRecord.get(row.record.id) ?? [] },
    })),
    total,
    undatedCount,
  };
}

/**
 * SPEC.md §7.4 for records. Only ONE referrer blocks:
 * `want_list.acquired_record_id`, which is NO ACTION because §7.3 makes the
 * want list double as acquisition history — deleting the record it points at
 * would destroy that history.
 *
 * The other five (images, journal_entries, price_history, record_genres,
 * record_tags) all CASCADE and must not be counted, or a delete the database
 * would happily perform is refused.
 */
export async function countRecordReferences(id: string): Promise<number> {
  return countReferences('records', id);
}

export type RecordDeleteOutcome =
  /**
   * `orphanedBlobUrls` — the images that cascaded, so the caller can delete the
   * blobs behind them.
   *
   * **Read BEFORE the delete, because the cascade destroys the evidence.**
   * `images.record_id` is `ON DELETE CASCADE`, so the rows holding the URLs are
   * gone the instant the record is; nothing can enumerate the orphans
   * afterwards. That is what made this leak unrecoverable rather than merely
   * invisible — the single-image path at least logs the URL it failed to
   * remove.
   *
   * The query layer returns them rather than deleting them itself: blobs are an
   * HTTP concern with its own failure handling, and §5.9's row-first ordering
   * is decided at the route.
   */
  | { status: 'deleted'; orphanedBlobUrls: string[] }
  | { status: 'not-found' }
  | { status: 'in-use'; referenceCount: number };

export async function deleteRecord(id: string): Promise<RecordDeleteOutcome> {
  const db = getDb();

  // Collected first — see the note on the type above.
  const doomed = await db
    .select({ url: images.url })
    .from(images)
    .where(eq(images.recordId, id));

  try {
    const deleted = await db.delete(records).where(eq(records.id, id)).returning({ id: records.id });

    return deleted.length > 0
      ? { status: 'deleted', orphanedBlobUrls: doomed.map((row) => row.url) }
      : { status: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('records', id) };
  }
}

/**
 * Records rolled up into every ancestor genre (SPEC.md §7.1), with counts.
 *
 * ONE implementation, used by BOTH `stats.byGenre` (§5.2) and
 * `recordFacets` (§5.2). They must agree for every genre: a `Punk (12)` chip
 * that yields a different number on the stats screen is the
 * confidently-misleading class CLAUDE.md §8 is about. Sharing the query makes
 * them agree BY CONSTRUCTION rather than by coincidence — the same reasoning
 * as `matchedVia` reusing `genreSubtree`. There is a test asserting the two
 * endpoints produce identical counts, which fails if this is ever forked.
 *
 * Walks UP from each tagged genre, so a genre appears when any DESCENDANT is
 * used even if nothing is tagged with it directly — §5.2 requires that, because
 * `Punk (12)` is precisely what a user wants to click.
 *
 * COUNT(DISTINCT record_id), not COUNT(*): a record tagged with both Oi! and
 * Punk reaches Punk by two paths and is still one record. That is the SECOND
 * of two dedup layers, and they mask each other — `UNION` (not `UNION ALL`)
 * already collapses repeated (record_id, genre_id) pairs. Mutation-verified:
 * removing either alone fails no test, removing BOTH fails the double-count
 * test. NOTES.md case 3 — do not delete one because it "looks unreachable".
 */
export async function genreRollup(): Promise<
  Array<{ id: string; name: string; count: number }>
> {
  const db = getDb();

  const result = await db.execute<{ id: string; name: string; count: number }>(sql`
    WITH RECURSIVE ancestry AS (
      SELECT rg.record_id, rg.genre_id FROM ${recordGenres} rg
      UNION
      SELECT a.record_id, g.parent_genre_id
        FROM ancestry a
        JOIN ${genres} g ON g.id = a.genre_id
       WHERE g.parent_genre_id IS NOT NULL
    )
    SELECT g.id, g.name, count(DISTINCT a.record_id)::int AS count
      FROM ancestry a
      JOIN ${genres} g ON g.id = a.genre_id
     GROUP BY g.id, g.name
     ORDER BY count(DISTINCT a.record_id) DESC, g.name
  `);

  return result.rows;
}

export type RecordFacet = { id: string; name: string; count: number };

export type RecordFacets = {
  genres: RecordFacet[];
  labels: RecordFacet[];
  stores: RecordFacet[];
  tags: RecordFacet[];
};

/**
 * SPEC.md §5.2 `GET /api/records/facets`: the values worth filtering by.
 *
 * Bounded by the COLLECTION, not by the reference tables. A chip for a genre no
 * record has returns zero rows when clicked — noise at twenty genres, not
 * merely at three hundred — and rendering the reference tables also truncates
 * silently once they exceed a page, which is the defect that prompted this.
 *
 * INNER joins here, deliberately, unlike the list read's LEFT joins: a label no
 * record uses must be ABSENT, so dropping unmatched rows is the intent rather
 * than an accident.
 *
 * Static: these describe the whole collection and do not vary with filters
 * (§5.2). Filter-aware counts would create dead ends — filter to Crust and the
 * Clay chip vanishes along with the control needed to undo it.
 */
export async function recordFacets(): Promise<RecordFacets> {
  const db = getDb();

  /**
   * Written out per table rather than through one helper: Drizzle types each
   * column to its own table, so a shared parameter would need a cast, and
   * casting to satisfy a helper is how the wrong column ends up joined.
   */
  const [genreRows, labelRows, storeRows, tagRows] = await Promise.all([
    genreRollup(),
    db
      .select({ id: labels.id, name: labels.name, count: sql<number>`count(*)::int` })
      .from(records)
      .innerJoin(labels, eq(labels.id, records.labelId))
      .groupBy(labels.id, labels.name)
      .orderBy(desc(sql`count(*)`), labels.name),
    db
      .select({ id: recordStores.id, name: recordStores.name, count: sql<number>`count(*)::int` })
      .from(records)
      .innerJoin(recordStores, eq(recordStores.id, records.storeId))
      .groupBy(recordStores.id, recordStores.name)
      .orderBy(desc(sql`count(*)`), recordStores.name),
    db
      .select({ id: tags.id, name: tags.name, count: sql<number>`count(*)::int` })
      .from(recordTags)
      .innerJoin(tags, eq(tags.id, recordTags.tagId))
      .groupBy(tags.id, tags.name)
      .orderBy(desc(sql`count(*)`), tags.name),
  ]);

  return { genres: genreRows, labels: labelRows, stores: storeRows, tags: tagRows };
}

export type RecordStats = {
  totalRecords: number;
  totalSpend: string;
  estimatedValue: string;
  byGenre: Array<{ id: string; name: string; count: number }>;
  byDecade: Array<{ decade: number; count: number }>;
  byStore: Array<{ id: string; name: string; count: number; spend: string }>;
  byLabel: Array<{ id: string; name: string; count: number }>;
};

/**
 * SPEC.md §5.2 stats, including §7.6's estimated collection value.
 *
 * §7.6: "for each record, the most recent price_history row of type `used`
 * (falling back to `new`, then to `purchase_price`). Sum."
 *
 * That is per-TYPE recency, NOT global recency — verified against the database
 * before implementing. A record with an old `used` price and a newer `new`
 * price contributes the USED one, because the chain prefers the type and only
 * then the recency within it. This is the opposite of the detail endpoint's
 * "latest price" (§5.2), which is why unit 3 deliberately did not apply this
 * chain there: the two rules answer different questions and would show the user
 * different numbers.
 *
 * Money is summed in SQL as NUMERIC and returned as a STRING. Adding
 * NUMERIC(10,2) in JavaScript would route it through a float and lose cents on
 * a large collection.
 */
export async function recordStats(): Promise<RecordStats> {
  const db = getDb();

  const latestOfType = (type: 'used' | 'new') => sql`(
    SELECT ph.price FROM ${priceHistory} ph
     WHERE ph.record_id = ${records.id} AND ph.price_type = ${type}
     ORDER BY ph.recorded_at DESC, ph.id DESC
     LIMIT 1
  )`;

  const [totals] = await db
    .select({
      totalRecords: sql<number>`count(*)::int`,
      totalSpend: sql<string>`COALESCE(sum(${records.purchasePrice}), 0)::numeric(12,2)::text`,
      // COALESCE IS the fallback chain: used, then new, then purchase price,
      // then nothing. A record with none of the three contributes 0.
      estimatedValue: sql<string>`COALESCE(sum(
        COALESCE(${latestOfType('used')}, ${latestOfType('new')}, ${records.purchasePrice}, 0)
      ), 0)::numeric(12,2)::text`,
    })
    .from(records);

  /**
   * §7.1 applies here too: a record tagged Oi! counts towards UK82 and Punk.
   * Without this the stats screen (§10) contradicts the collection screen about
   * how many punk records exist, and the number that looks wrong is the one on
   * the summary page.
   *
   * Walks UP from each tagged genre — the opposite direction from the list
   * filter, because the question is inverted: there, "which genres count as the
   * one requested"; here, "which genres does this record roll up into".
   *
   * COUNT(DISTINCT record_id), not COUNT(*): a record tagged with both Oi! and
   * Punk reaches Punk by two paths and is still one record.
   *
   * That is the SECOND of two dedup layers, and they mask each other — `UNION`
   * (not `UNION ALL`) already collapses repeated (record_id, genre_id) pairs as
   * the walk produces them. Mutation-verified: removing either alone fails no
   * test, removing BOTH fails 'counts a record once per ancestor'. NOTES.md
   * case 3 — do not delete one because it "looks unreachable". Both are kept
   * because they guard different things: UNION also bounds the walk if a cycle
   * ever reaches the data, the same reasoning as wouldCreateCycle in ./genres.
   */
  const byGenre = await genreRollup();

  const byDecade = await db
    .select({
      decade: sql<number>`((${records.releaseYear} / 10) * 10)::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(records)
    // A null release year has no decade; bucketing it would invent a category.
    .where(sql`${records.releaseYear} IS NOT NULL`)
    .groupBy(sql`(${records.releaseYear} / 10) * 10`)
    .orderBy(sql`(${records.releaseYear} / 10) * 10`);

  const byStore = await db
    .select({
      id: recordStores.id,
      name: recordStores.name,
      count: sql<number>`count(*)::int`,
      spend: sql<string>`COALESCE(sum(${records.purchasePrice}), 0)::numeric(12,2)::text`,
    })
    .from(records)
    .innerJoin(recordStores, eq(recordStores.id, records.storeId))
    .groupBy(recordStores.id, recordStores.name)
    .orderBy(desc(sql`count(*)`), recordStores.name);

  /**
   * §5.2's `byLabel`, added when §10's screen asked for it. INNER JOIN, like
   * `byStore`: `label_id` is nullable (§4.2), and a LEFT JOIN would render "no
   * label" as a shelf category called nothing.
   *
   * Tie broken by name so the order is stable between calls — a screen that
   * reorders on refresh looks broken.
   */
  const byLabel = await db
    .select({
      id: labels.id,
      name: labels.name,
      count: sql<number>`count(*)::int`,
    })
    .from(records)
    .innerJoin(labels, eq(labels.id, records.labelId))
    .groupBy(labels.id, labels.name)
    .orderBy(desc(sql`count(*)`), labels.name);

  return {
    totalRecords: totals?.totalRecords ?? 0,
    totalSpend: totals?.totalSpend ?? '0.00',
    estimatedValue: totals?.estimatedValue ?? '0.00',
    byGenre,
    byDecade,
    byStore,
    byLabel,
  };
}
