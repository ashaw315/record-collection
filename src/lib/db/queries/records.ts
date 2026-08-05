import 'server-only';
import { desc, eq, inArray } from 'drizzle-orm';
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
