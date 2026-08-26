import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { desc, sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, gapAnalysisResults, records } from '@/db/schema';
import {
  latestGapAnalysis,
  storeGapAnalysis,
} from '@/lib/db/queries/gap-analysis';

/**
 * SPEC.md §9.2 (A39, 2026-08-26) — the last result is kept for DISPLAY.
 *
 * **The defect, from real use.** The result lived in component state, so
 * navigating away destroyed it, and seeing the same answer again meant asking
 * again — spending one of ten hourly requests to be told what you had already
 * been told.
 *
 * **A record of what was said, never a cache.** Nothing here is served in place
 * of a request the user made; "Suggest" always calls. That is asserted at the
 * route, not here — this file is the store's own contract.
 */

const SUGGESTIONS = [
  { artist: 'Crass', title: 'The Feeding of the 5000', reason: 'r', genre: 'UK82' },
  { artist: 'Rudimentary Peni', title: 'Death Church', reason: 'r', genre: 'UK82' },
];

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

describe('the stored gap analysis', () => {
  it('returns null when nothing has ever been asked', async () => {
    expect(await latestGapAnalysis()).toBeNull();
  });

  it('round-trips the suggestions and the dropped count', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 1 });

    const stored = await latestGapAnalysis();

    expect(stored?.suggestions).toEqual(SUGGESTIONS);
    expect(stored?.dropped).toBe(1);
    expect(stored?.askedAt).toBeInstanceOf(Date);
  });

  /**
   * **The last result, not a history.** A second analysis supersedes the first:
   * the screen shows what was most recently said, and an older answer about an
   * older collection is not something the user asked to keep.
   *
   * Fails against `latestGapAnalysis` reading the wrong row — an `ORDER BY`
   * omitted, or ascending.
   */
  it('returns the most recent when several have been asked', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await storeGapAnalysis({
      suggestions: [{ artist: 'Discharge', title: 'Hear Nothing', reason: 'r', genre: 'UK82' }],
      dropped: 2,
    });

    const stored = await latestGapAnalysis();

    expect(stored?.suggestions).toHaveLength(1);
    expect(stored?.suggestions[0]?.artist).toBe('Discharge');
    expect(stored?.dropped).toBe(2);
  });

  /** An empty analysis is a real answer — "nothing to suggest" is not "never asked". */
  it('distinguishes an empty result from no result at all', async () => {
    await storeGapAnalysis({ suggestions: [], dropped: 0 });

    const stored = await latestGapAnalysis();

    expect(stored, 'an empty answer is still an answer').not.toBeNull();
    expect(stored?.suggestions).toEqual([]);
  });
});

describe('what has changed since it was asked', () => {
  /**
   * **The fact the timestamp does not carry** (A39). "Asked 20 minutes ago" is
   * about the REQUEST; "before you added 5 records" is about whether the answer
   * still applies, and they diverge in the dangerous direction — two minutes
   * with five records added reads as fresh and is not.
   *
   * A gap analysis is a claim about what is MISSING, so adding records is
   * exactly the event that invalidates it.
   */
  async function seedRecord(name: string, createdAt: Date) {
    const db = getTestDb();
    const [artist] = await db.insert(artists).values({ name }).returning();
    await db.insert(records).values({
      artistId: artist.id,
      title: `${name} LP`,
      createdAt,
    });
  }

  it('counts records added AFTER the analysis was asked', async () => {
    const before = new Date(Date.now() - 60 * 60 * 1000);
    await seedRecord('Older', before);

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });

    await seedRecord('Newer A', new Date());
    await seedRecord('Newer B', new Date());

    const stored = await latestGapAnalysis();

    expect(stored?.recordsAddedSince, 'only the two added after').toBe(2);
  });

  /**
   * **Zero when nothing has changed**, which is what lets the UI stay quiet.
   * A caveat shown when the answer is current is noise that spends the
   * credibility of the one that matters (§12 step 14c's variant-limit rule).
   */
  it('is zero when the collection has not changed since', async () => {
    await seedRecord('Older', new Date(Date.now() - 60 * 60 * 1000));
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });

    const stored = await latestGapAnalysis();

    expect(stored?.recordsAddedSince).toBe(0);
  });

  /**
   * **Records only — want-list additions are deliberately not counted** (A39).
   * A want-list row does change what the model is told, but records are what
   * the suggestions are ABOUT, and a sentence carrying two numbers is vaguer
   * than either.
   *
   * Fails against a count that reaches into `want_list`.
   */
  it('does not count want-list additions', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });

    const db = getTestDb();
    const [artist] = await db.insert(artists).values({ name: 'Wanted' }).returning();
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${artist.id}, 'Some LP', 3)`,
    );

    const stored = await latestGapAnalysis();

    expect(stored?.recordsAddedSince, 'a want-list row is not a record').toBe(0);
  });
});

describe('the store keeps only what it needs', () => {
  /**
   * One row per analysis is fine, but the screen shows the last one — so an
   * unbounded table is debris. Superseded rows are removed on write, which is
   * cheaper than a scheduled job that can fail to run (the same reasoning
   * §4.3 gives for `llm_requests` carrying its own timestamps).
   */
  it('supersedes rather than accumulating', async () => {
    for (let i = 0; i < 4; i += 1) {
      await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: i });
    }

    const rows = await getTestDb()
      .select()
      .from(gapAnalysisResults)
      .orderBy(desc(gapAnalysisResults.askedAt));

    expect(rows).toHaveLength(1);
  });
});
