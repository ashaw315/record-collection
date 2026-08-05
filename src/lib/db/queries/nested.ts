import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { recordGenres, recordTags, records } from '@/db/schema';

/**
 * The transactional nested-write primitive (SPEC.md §5.2).
 *
 * This is the project's first code that writes two tables in one request. The
 * parent row and its junction rows must both land or neither: a record created
 * with its genres silently dropped is WORSE than a rejected create, because it
 * looks successful and the loss only surfaces later as missing graph edges (§8)
 * and wrong filter results.
 *
 * Isolated from the route handlers deliberately. Transactional behaviour
 * differs between the `pg` and Neon drivers (CLAUDE.md §2), so the same
 * behaviour is exercised twice: here against local Postgres, and in
 * test/integration/neon-transactions.test.ts against a real Neon branch.
 */

/**
 * Upper bound on ids in one nested array.
 *
 * An unbounded array is an unbounded INSERT inside a transaction holding a lock
 * on the parent row. 200 is far beyond any plausible number of genres or tags
 * on one record while still bounding the work — the same reasoning as
 * MAX_PAGE_SIZE, and it is checked BEFORE the transaction opens so an
 * over-large request costs nothing.
 */
export const MAX_NESTED_IDS = 200;

export type RecordValues = {
  artistId: string;
  title: string;
  labelId?: string | null;
  formatId?: string | null;
  pressingId?: string | null;
  storeId?: string | null;
  releaseYear?: number | null;
  conditionMedia?: 'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P' | null;
  conditionSleeve?: 'M' | 'NM' | 'VG+' | 'VG' | 'G+' | 'G' | 'F' | 'P' | null;
  purchasePrice?: string | null;
  purchaseDate?: string | null;
  notes?: string | null;
};

export type RecordRow = typeof records.$inferSelect;

/**
 * Removes repeats while preserving order.
 *
 * Verified against the database: the junction tables' composite primary keys
 * reject a repeated pair, so passing the same id twice would surface as a 500.
 * Deduping rather than rejecting is the right call — a multi-select can
 * plausibly submit a duplicate and the user's intent is unambiguous.
 */
function unique(ids: string[]): string[] {
  return [...new Set(ids)];
}

function assertWithinBounds(label: string, ids: string[]): void {
  if (ids.length > MAX_NESTED_IDS) {
    throw new Error(`${label} must contain at most ${MAX_NESTED_IDS} ids, received ${ids.length}`);
  }
}

/**
 * Creates a record together with its genre and tag links, atomically.
 *
 * Every failure mode rolls the whole thing back: an invalid parent, an invalid
 * genre id, an invalid tag id, or a failure after some links have already been
 * written.
 */
export async function writeRecordWithNested(input: {
  values: RecordValues;
  genreIds: string[];
  tagIds: string[];
}): Promise<RecordRow> {
  // Checked before the transaction opens: an over-large request should cost
  // nothing, not a lock plus a rollback.
  assertWithinBounds('genreIds', input.genreIds);
  assertWithinBounds('tagIds', input.tagIds);

  const genreIds = unique(input.genreIds);
  const tagIds = unique(input.tagIds);

  const db = getDb();

  return db.transaction(async (tx) => {
    const [created] = await tx.insert(records).values(input.values).returning();

    if (genreIds.length > 0) {
      await tx
        .insert(recordGenres)
        .values(genreIds.map((genreId) => ({ recordId: created.id, genreId })));
    }

    if (tagIds.length > 0) {
      await tx.insert(recordTags).values(tagIds.map((tagId) => ({ recordId: created.id, tagId })));
    }

    return created;
  });
}

/**
 * Replaces a record's genre links with exactly `genreIds`.
 *
 * REPLACE, not merge: the caller sends the complete desired set, so an empty
 * array means "remove all". That distinction is the half of PATCH semantics the
 * template's strictObject shape cannot express (NOTES.md criterion 10), and it
 * has to exist in the primitive before the endpoint can offer it.
 *
 * Transactional so a failed replacement leaves the ORIGINAL set intact — a
 * half-applied replace is the same silent corruption as a half-applied create.
 */
export async function replaceRecordGenres(recordId: string, genreIds: string[]): Promise<void> {
  assertWithinBounds('genreIds', genreIds);
  const ids = unique(genreIds);
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.delete(recordGenres).where(eq(recordGenres.recordId, recordId));

    if (ids.length > 0) {
      await tx.insert(recordGenres).values(ids.map((genreId) => ({ recordId, genreId })));
    }
  });
}

/** The tag counterpart. Separate function, not a shared "clear the junctions"
 * helper: replacing genres must leave tags untouched, and one helper taking a
 * table is exactly how that gets confused. */
export async function replaceRecordTags(recordId: string, tagIds: string[]): Promise<void> {
  assertWithinBounds('tagIds', tagIds);
  const ids = unique(tagIds);
  const db = getDb();

  await db.transaction(async (tx) => {
    await tx.delete(recordTags).where(eq(recordTags.recordId, recordId));

    if (ids.length > 0) {
      await tx.insert(recordTags).values(ids.map((tagId) => ({ recordId, tagId })));
    }
  });
}
