import 'server-only';
import { asc, eq, isNull, or, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { artists, recordMoods, records } from '@/db/schema';
import type { Mood } from '@/lib/moods/moods';
import type { MoodSet, RecordToTag } from '@/lib/moods/tagging';

/**
 * SPEC.md §4.5 and §7.12 (A76): which records a tagging run asks about, and
 * how their sets are written.
 *
 * A default run asks about every record with no row, which covers the
 * backfill, new records and retried failures in one rule. A regeneration also
 * asks about every set that is not `overridden`.
 */
export async function recordsToTag({ regenerate }: { regenerate: boolean }): Promise<RecordToTag[]> {
  const db = getDb();
  const unlooked = isNull(recordMoods.recordId);

  return db
    .select({ id: records.id, artist: artists.name, title: records.title })
    .from(records)
    .innerJoin(artists, eq(artists.id, records.artistId))
    .leftJoin(recordMoods, eq(recordMoods.recordId, records.id))
    .where(regenerate ? or(unlooked, eq(recordMoods.overridden, false)) : unlooked)
    .orderBy(asc(records.title), asc(records.id));
}

/**
 * Write a run's sets, returning how many rows were written.
 *
 * **The `overridden` guard is in the statement too**, not only in the read
 * above: a set corrected by hand between the read and the write must still
 * survive, and a regeneration never rewrites one (§4.5).
 */
export async function writeMoodSets(sets: MoodSet[], model: string): Promise<number> {
  // An empty INSERT is a syntax error, so this is a real branch.
  if (sets.length === 0) return 0;

  const db = getDb();
  const taggedAt = new Date();

  const written = await db
    .insert(recordMoods)
    .values(sets.map((set) => ({ recordId: set.recordId, moods: set.moods, taggedAt, taggedByModel: model })))
    .onConflictDoUpdate({
      target: recordMoods.recordId,
      // `excluded`: each conflicting row takes its own incoming set.
      set: {
        moods: sql`excluded.moods`,
        taggedAt: sql`excluded.tagged_at`,
        taggedByModel: sql`excluded.tagged_by_model`,
      },
      setWhere: eq(recordMoods.overridden, false),
    })
    .returning({ recordId: recordMoods.recordId });

  return written.length;
}

/** A record's stored set, or `null` when no row exists: not yet looked at (§4.5). */
export async function moodSetFor(recordId: string): Promise<string[] | null> {
  const db = getDb();
  const [row] = await db.select({ moods: recordMoods.moods }).from(recordMoods).where(eq(recordMoods.recordId, recordId));
  return row?.moods ?? null;
}

export async function recordExists(recordId: string): Promise<boolean> {
  const db = getDb();
  const [row] = await db.select({ id: records.id }).from(records).where(eq(records.id, recordId));
  return row !== undefined;
}

/**
 * A set written by hand (§4.5): `overridden`, and no model, so a regeneration
 * leaves it alone and `tagged_by_model` cannot claim a model wrote it.
 */
export async function overrideMoodSet(recordId: string, moods: Mood[]): Promise<void> {
  const db = getDb();
  const row = { recordId, moods, taggedAt: new Date(), taggedByModel: null, overridden: true };

  await db
    .insert(recordMoods)
    .values(row)
    .onConflictDoUpdate({
      target: recordMoods.recordId,
      set: { moods: row.moods, taggedAt: row.taggedAt, taggedByModel: null, overridden: true },
    });
}
