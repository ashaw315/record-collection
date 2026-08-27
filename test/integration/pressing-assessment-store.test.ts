import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, pressingAssessments, wantList } from '@/db/schema';
import {
  latestAssessment,
  storeAssessment,
  clearAssessment,
  assessmentForRecord,
} from '@/lib/db/queries/pressing-assessment';
import { acquireWantListItem } from '@/lib/db/queries/want-list';

/**
 * SPEC.md §12b (A43) — the stored assessment.
 *
 * **Stored because it does not go stale.** A gap analysis is a claim about a
 * collection that changes; a pressing assessment is a claim about an album's
 * pressing history, which does not — so there is no reason to ask twice, and
 * each album costs one of ten hourly requests exactly once.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const ASSESSMENT = {
  verdict: 'matters' as const,
  pressings: [{ description: 'First US press', identifier: 'ABC AB-1006, AB-1006-A in the runout' }],
  dropped: 1,
  orderedBy: null,
};

async function seedWanted(title = 'Aja') {
  const [artist] = await db.insert(artists).values({ name: `A-${Date.now()}` }).returning();
  const [item] = await db
    .insert(wantList)
    .values({ title, artistId: artist.id, priority: 3 })
    .returning();
  return { artistId: artist.id, itemId: item.id };
}

describe('storing and reading back', () => {
  it('round-trips the verdict, pressings and dropped count', async () => {
    const { itemId } = await seedWanted();

    await storeAssessment(itemId, ASSESSMENT);
    const stored = await latestAssessment(itemId);

    expect(stored?.verdict).toBe('matters');
    expect(stored?.pressings[0]?.identifier).toContain('AB-1006');
    expect(stored?.dropped).toBe(1);
    expect(stored?.askedAt).toBeInstanceOf(Date);
  });

  it('returns null when nothing has been asked for that row', async () => {
    const { itemId } = await seedWanted();

    expect(await latestAssessment(itemId)).toBeNull();
  });

  /**
   * **One per row, replaced on re-ask.** Nothing in the app reads a superseded
   * assessment, so a history would be a table growing for a use case nobody has
   * named. Re-asking is a deliberate act that costs a request; it replaces.
   */
  it('replaces rather than accumulating when asked again', async () => {
    const { itemId } = await seedWanted();

    await storeAssessment(itemId, ASSESSMENT);
    await storeAssessment(itemId, { verdict: 'any-copy', pressings: [], dropped: 0, orderedBy: null });

    const stored = await latestAssessment(itemId);
    expect(stored?.verdict).toBe('any-copy');

    const rows = await db.select().from(pressingAssessments);
    expect(rows, 'one row per want-list item').toHaveLength(1);
  });

  /** Deleting is not editing: it removes the assessment and writes nothing. */
  it('clears an assessment without leaving a trace', async () => {
    const { itemId } = await seedWanted();
    await storeAssessment(itemId, ASSESSMENT);

    await clearAssessment(itemId);

    expect(await latestAssessment(itemId)).toBeNull();
  });

  /**
   * An `any-copy` verdict names no pressings, and that is a RESULT rather than
   * an empty row — it must read back as `any-copy`, not as nothing stored.
   */
  it('stores an any-copy verdict as a verdict, not as an absence', async () => {
    const { itemId } = await seedWanted();

    await storeAssessment(itemId, { verdict: 'any-copy', pressings: [], dropped: 0, orderedBy: null });
    const stored = await latestAssessment(itemId);

    expect(stored, 'an answered "any copy" is not the same as never asked').not.toBeNull();
    expect(stored?.verdict).toBe('any-copy');
  });
});

describe('the assessment survives acquisition', () => {
  /**
   * **Adam's requirement, and it gets a TEST rather than a comment.**
   *
   * The claim is that an assessment attached to a want-list row survives the
   * move from want list to collection, because `acquireWantListItem` sets
   * `is_acquired` and `acquired_record_id` rather than deleting (§7.3).
   *
   * **That was true in the SCHEMA and unproven in the APP** — the same shape as
   * `/want-list/:id/edit`, which was specified, absent, and unnoticed for ten
   * steps. So this exercises a REAL acquisition rather than asserting the
   * foreign key.
   *
   * Fails against an acquire path that deletes the row, and against a cascade
   * that takes the assessment with it.
   */
  it('is still readable after the want-list item is acquired', async () => {
    const { artistId, itemId } = await seedWanted('Aja');
    await storeAssessment(itemId, ASSESSMENT);

    await acquireWantListItem({
      wantListId: itemId,
      values: { title: 'Aja', artistId },
      genreIds: [],
      tagIds: [],
    });

    const [row] = await db.select().from(wantList).where(eq(wantList.id, itemId));
    expect(row?.isAcquired, 'the row is marked rather than deleted').toBe(true);
    expect(row?.acquiredRecordId, 'and links to the record it became').not.toBeNull();

    const stored = await latestAssessment(itemId);
    expect(stored?.verdict, 'the assessment outlives the hunt').toBe('matters');
  });

  /**
   * And it is reachable FROM the record, which is the direction that makes it
   * useful after acquiring — "is mine the good one" is asked on the record, not
   * on a want-list row the user has stopped looking at.
   */
  it('is reachable from the record the row became', async () => {
    const { artistId, itemId } = await seedWanted('Aja');
    await storeAssessment(itemId, ASSESSMENT);

    const record = await acquireWantListItem({
      wantListId: itemId,
      values: { title: 'Aja', artistId },
      genreIds: [],
      tagIds: [],
    });

    const found = await assessmentForRecord(record.id);
    expect(found?.verdict, 'the record can find what was said about the album').toBe('matters');
  });
});
