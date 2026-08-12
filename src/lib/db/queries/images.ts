import 'server-only';
import { eq } from 'drizzle-orm';
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
