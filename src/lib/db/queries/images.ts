import 'server-only';
import { and, desc, eq, inArray } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { images } from '@/db/schema';

/**
 * The `images` query layer (SPEC.md §4.2, §5.9).
 *
 * Separate from `records.ts` because CLAUDE.md §6 keeps database access out of
 * route handlers, and the record's hydrated read already selects images through
 * its own join — these are the write paths that join does not cover.
 */

export type ImageRow = typeof images.$inferSelect;
export type ImageType = NonNullable<ImageRow['imageType']>;

export async function createImage(input: {
  recordId: string;
  url: string;
  imageType: ImageType | null;
  caption: string | null;
}): Promise<ImageRow> {
  const db = getDb();

  const [row] = await db
    .insert(images)
    .values({
      recordId: input.recordId,
      url: input.url,
      imageType: input.imageType,
      caption: input.caption,
    })
    .returning();

  return row;
}

export async function findImageById(id: string): Promise<ImageRow | undefined> {
  const db = getDb();

  const [row] = await db.select().from(images).where(eq(images.id, id)).limit(1);
  return row;
}

export async function deleteImage(id: string): Promise<void> {
  const db = getDb();

  await db.delete(images).where(eq(images.id, id));
}

/** §61: the cover the record shows -- its newest cover row, or none. */
export async function newestCoverFor(recordId: string): Promise<ImageRow | undefined> {
  const db = getDb();
  const [row] = await db
    .select()
    .from(images)
    .where(and(eq(images.recordId, recordId), eq(images.imageType, 'cover')))
    .orderBy(desc(images.createdAt), desc(images.id))
    .limit(1);
  return row;
}

/**
 * Each record's newest cover (§61), for the records named and no others.
 * The grid's read (§T.5): the list query carries no image and the records
 * endpoint keeps §5.2's shape, so the page asks here for the records it is
 * about to draw. A record with no cover has no entry.
 */
export async function newestCoverUrls(recordIds: readonly string[]): Promise<Map<string, string>> {
  if (recordIds.length === 0) return new Map();
  const db = getDb();

  const rows = await db
    .selectDistinctOn([images.recordId], { recordId: images.recordId, url: images.url })
    .from(images)
    .where(and(inArray(images.recordId, [...recordIds]), eq(images.imageType, 'cover')))
    .orderBy(images.recordId, desc(images.createdAt), images.id);

  const covers = new Map<string, string>();
  // `record_id` is nullable in the schema; the filter above admits none, and the type does not know that.
  for (const row of rows) if (row.recordId !== null) covers.set(row.recordId, row.url);
  return covers;
}
