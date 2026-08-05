import 'server-only';
import { and, asc, desc, eq, exists, gte, ilike, inArray, lte, or, sql } from 'drizzle-orm';
import { isForeignKeyViolation } from '@/lib/api/errors';
import { countReferences } from './referrers';
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

/** The §5.2 sortable fields. `artist` has no column on `records`. */
export const RECORD_SORT_FIELDS = [
  'title',
  'artist',
  'purchaseDate',
  'purchasePrice',
  'releaseYear',
] as const;
export type RecordSortField = (typeof RECORD_SORT_FIELDS)[number];

export type RecordFilters = {
  artistId?: string;
  genreId?: string;
  labelId?: string;
  storeId?: string;
  tagId?: string;
  formatId?: string;
  condition?: (typeof records.conditionMedia)['_']['data'];
  yearFrom?: number;
  yearTo?: number;
  q?: string;
};

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
  if (filters.yearFrom !== undefined) clauses.push(gte(records.releaseYear, filters.yearFrom));
  if (filters.yearTo !== undefined) clauses.push(lte(records.releaseYear, filters.yearTo));

  if (filters.genreId !== undefined) {
    const genreId = filters.genreId;
    clauses.push(
      exists(
        getDb()
          .select({ one: sql`1` })
          .from(recordGenres)
          .where(and(eq(recordGenres.recordId, records.id), eq(recordGenres.genreId, genreId))),
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
    const like = `%${q}%`;

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

export async function listRecords(options: {
  limit: number;
  offset: number;
  sort?: { field: RecordSortField; direction: 'asc' | 'desc' };
  filters: RecordFilters;
}): Promise<{ rows: RecordRow[]; total: number }> {
  const db = getDb();
  const where = buildWhere(options.filters);

  const column = sortExpression(options.sort?.field ?? 'title');
  const ordered = options.sort?.direction === 'desc' ? desc(column) : asc(column);

  const rows = await db
    .select()
    .from(records)
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

  return { rows, total: totals?.value ?? 0 };
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
  | { status: 'deleted' }
  | { status: 'not-found' }
  | { status: 'in-use'; referenceCount: number };

export async function deleteRecord(id: string): Promise<RecordDeleteOutcome> {
  const db = getDb();

  try {
    const deleted = await db.delete(records).where(eq(records.id, id)).returning({ id: records.id });
    return deleted.length > 0 ? { status: 'deleted' } : { status: 'not-found' };
  } catch (error) {
    if (!isForeignKeyViolation(error)) throw error;
    return { status: 'in-use', referenceCount: await countReferences('records', id) };
  }
}

export async function updateRecordFields(
  id: string,
  values: Partial<typeof records.$inferInsert>,
): Promise<RecordRow | undefined> {
  const db = getDb();
  if (Object.keys(values).length === 0) return findRecordById(id);

  const [row] = await db.update(records).set(values).where(eq(records.id, id)).returning();
  return row;
}
