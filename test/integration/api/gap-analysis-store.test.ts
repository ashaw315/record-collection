import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { desc, sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../../helpers/db';
import { artists, gapAnalysisResults, records } from '@/db/schema';
import {
  gapAnalysisWithPrevious,
  latestGapAnalysis,
  reasonFor,
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

/**
 * Moves the newest stored answer back in time.
 *
 * **`asked_at` defaults to `now()`, so two answers written in one test are
 * milliseconds apart** and no record can be seeded "between" them. Backdating
 * the newest row is what makes an interval exist to add a record into — the
 * alternative is sleeping, which trades real seconds for the same effect.
 *
 * Ordered by `asked_at` rather than by insertion, so it moves the row the reads
 * under test would call current.
 */
async function backdateNewest(millisecondsAgo: number) {
  const db = getTestDb();
  const at = new Date(Date.now() - millisecondsAgo);

  await db.execute(sql`
    UPDATE gap_analysis_results SET asked_at = ${at}
     WHERE id = (SELECT id FROM gap_analysis_results ORDER BY asked_at DESC LIMIT 1)
  `);
}

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

    /*
     * **Two, not one** — the retention unit. A39 kept one because nothing read
     * a superseded answer; the Aja case named the use (comparing two answers
     * about the same question, where neither dominated) and the ceiling moved
     * by one.
     *
     * **The test's subject is unchanged: the table does not grow without
     * bound.** Four asks still leave a fixed number of rows, and that is what
     * this has always defended. Current-plus-one is bounded BY CONSTRUCTION —
     * the ceiling follows from the design rather than from a retention policy
     * somebody has to remember to run.
     */
    expect(rows, 'current plus one previous').toHaveLength(2);
    expect(rows[0]?.dropped, 'the newest is current').toBe(3);
    expect(rows[1]?.dropped, 'the one before it is previous').toBe(2);
  });
});

/**
 * SPEC.md §9.2 — RETENTION: current plus one previous, per scope.
 *
 * **The Aja case is the evidence.** Two assessments of one album, asked minutes
 * apart, produced different lists — and NEITHER DOMINATED: the second was more
 * actionable on what it kept, the first had better coverage. That is a fact
 * about the tool observable only across two answers, and it survived by accident
 * in terminal scrollback because the design discarded the material.
 *
 * **"Nothing reads it" was true and was not the right question.** The value of a
 * stored answer is not only what the app reads — it is what the USER can
 * compare, and a re-ask is precisely the moment two answers about one question
 * exist.
 */
describe('the previous answer is kept alongside the current one', () => {
  it('returns null for both when nothing has ever been asked', async () => {
    const both = await gapAnalysisWithPrevious();

    expect(both.current).toBeNull();
    expect(both.previous, 'never asked is not the same as asked once').toBeNull();
  });

  /**
   * **A single answer has no previous**, which is distinct from having a
   * previous that is empty. Fails against a read that returns the current row
   * twice, or that treats `rows[1]` as present without checking.
   */
  it('has no previous after a single ask', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });

    const both = await gapAnalysisWithPrevious();

    expect(both.current?.suggestions).toHaveLength(2);
    expect(both.previous).toBeNull();
  });

  /**
   * The comparison the unit exists for. Fails against `storeGapAnalysis` still
   * deleting the whole scope before inserting, and against a read that orders
   * ascending.
   */
  it('returns the two most recent answers, newest as current', async () => {
    await storeGapAnalysis({
      suggestions: [{ artist: 'First', title: 'A', reason: 'r', genre: 'UK82' }],
      dropped: 1,
    });
    await storeGapAnalysis({
      suggestions: [{ artist: 'Second', title: 'B', reason: 'r', genre: 'UK82' }],
      dropped: 2,
    });

    const both = await gapAnalysisWithPrevious();

    expect(both.current?.suggestions[0]?.artist).toBe('Second');
    expect(both.current?.dropped).toBe(2);
    expect(both.previous?.suggestions[0]?.artist).toBe('First');
    expect(both.previous?.dropped).toBe(1);
  });

  /**
   * **The third answer is discarded**, and this is the bound the design gives
   * rather than a policy anyone runs. Fails against a store that stops deleting
   * altogether.
   */
  it('keeps exactly two across three asks, dropping the oldest', async () => {
    for (const artist of ['Oldest', 'Middle', 'Newest']) {
      await storeGapAnalysis({
        suggestions: [{ artist, title: 'A', reason: 'r', genre: 'UK82' }],
        dropped: 0,
      });
    }

    const both = await gapAnalysisWithPrevious();

    expect(both.current?.suggestions[0]?.artist).toBe('Newest');
    expect(both.previous?.suggestions[0]?.artist).toBe('Middle');

    const rows = await getTestDb().select().from(gapAnalysisResults);
    expect(rows, 'the oldest is gone').toHaveLength(2);
  });
});

/**
 * **THE DESIGN QUESTION IN THIS UNIT: the previous answer carries ITS OWN
 * staleness, computed from ITS OWN `asked_at`.**
 *
 * `recordsAddedSince` is a fact about what an answer COVERS. A collection-wide
 * answer from before five records were added is superseded in a way a later one
 * is not — so the previous row cannot borrow the current row's count.
 * Presenting two answers as equally current claims about the same collection is
 * exactly what this unit exists to avoid.
 */
describe('each answer carries its own staleness', () => {
  async function seedRecordAt(name: string, createdAt: Date) {
    const db = getTestDb();
    const [artist] = await db.insert(artists).values({ name }).returning();
    await db.insert(records).values({ artistId: artist.id, title: `${name} LP`, createdAt });
  }

  /**
   * The load-bearing assertion of the unit. Records land BETWEEN the two asks
   * and AFTER the second, so the two counts must differ — and the previous
   * answer's is the larger, because it has been superseded for longer.
   *
   * **Fails against `gapAnalysisWithPrevious` computing one count and assigning
   * it to both rows**, which is the natural implementation and the one the
   * handoff warned about.
   */
  it('gives the previous answer a LARGER count than the current one', async () => {
    await seedRecordAt('Before everything', new Date(Date.now() - 3 * 60 * 60 * 1000));

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await backdateNewest(2 * 60 * 60 * 1000);

    // Added after the FIRST ask only.
    await seedRecordAt('Between the asks', new Date(Date.now() - 60 * 60 * 1000));

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await backdateNewest(30 * 60 * 1000);

    // Added after BOTH asks.
    await seedRecordAt('After both', new Date());

    const both = await gapAnalysisWithPrevious();

    expect(both.current?.recordsAddedSince, 'one record after the second ask').toBe(1);
    expect(both.previous?.recordsAddedSince, 'two records after the first ask').toBe(2);
  });

  /**
   * The quiet case, and it must stay quiet for the previous answer too: a
   * caveat shown when nothing has changed is noise (A39). Fails against a count
   * of all records rather than those added since.
   */
  it('is zero for both when nothing has been added since either', async () => {
    await seedRecordAt('Old', new Date(Date.now() - 5 * 60 * 60 * 1000));

    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await backdateNewest(2 * 60 * 60 * 1000);
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });

    const both = await gapAnalysisWithPrevious();

    expect(both.current?.recordsAddedSince).toBe(0);
    expect(both.previous?.recordsAddedSince).toBe(0);
  });
});

/**
 * SPEC.md §9.2 — the model's reason, retrievable for the want-list form.
 *
 * **Finding 3, from Adam's real use.** He read why a record was suggested, then
 * arrived at `/want-list/new` with the dig fields empty and nothing explaining
 * why he was there. §9.1's reasons ARE shown on that page — but only when
 * regenerated from an `artistId`, which a §9.2 suggestion of a new artist never
 * has.
 *
 * **Nothing here reaches the `want_list` row**, and that is unchanged: the three
 * arguments at `want-list/new/page.tsx` stand — `best_dig_notes` means something
 * else (CLAUDE.md §8), `target_pressing` is a FK the model cannot supply, and a
 * reason is true only at a moment.
 */
describe('the stored reason for one suggestion', () => {
  const SUGGESTION = {
    artist: 'Steely Dan',
    title: 'Aja',
    reason: 'Gaucho is on your shelf, and this is the record it was chasing.',
    genre: 'Jazz Rock',
  };

  it('finds the reason for a suggestion in the stored analysis', async () => {
    await storeGapAnalysis({ suggestions: [SUGGESTION], dropped: 0 });

    expect(await reasonFor('Steely Dan', 'Aja')).toBe(SUGGESTION.reason);
  });

  /**
   * Matched case- and whitespace-insensitively, because the value arrives back
   * through a URL the user may have edited and Discogs-adjacent titles vary in
   * casing. Fails against a strict equality match.
   */
  it('matches without being defeated by casing or spacing', async () => {
    await storeGapAnalysis({ suggestions: [SUGGESTION], dropped: 0 });

    expect(await reasonFor('  steely dan ', 'AJA')).toBe(SUGGESTION.reason);
  });

  /**
   * **The stale-store case, and it is a CONSEQUENCE rather than a bug** (A39).
   * That unit decided the store keeps ONE analysis — the last — because the
   * screen shows the last answer and a superseded one is debris.
   *
   * So a reason exists for suggestions from the CURRENT analysis and never for
   * older ones. Fails against a lookup that throws, or that returns some other
   * suggestion's reason.
   */
  it('returns null for a suggestion from a superseded analysis', async () => {
    await storeGapAnalysis({ suggestions: [SUGGESTION], dropped: 0 });
    // A newer analysis supersedes it — A39 keeps one.
    await storeGapAnalysis({
      suggestions: [{ artist: 'Can', title: 'Tago Mago', reason: 'r', genre: 'Krautrock' }],
      dropped: 0,
    });

    expect(await reasonFor('Steely Dan', 'Aja')).toBeNull();
  });

  it('returns null when nothing has ever been asked', async () => {
    expect(await reasonFor('Steely Dan', 'Aja')).toBeNull();
  });

  /**
   * **The artist alone is not enough.** A29g welcomes a different record by an
   * owned artist, so one artist can appear across analyses with different
   * titles — returning the artist's reason for the wrong record would attribute
   * to the model something it said about a different album.
   */
  it('does not return one record\'s reason for another by the same artist', async () => {
    await storeGapAnalysis({ suggestions: [SUGGESTION], dropped: 0 });

    expect(await reasonFor('Steely Dan', 'Gaucho')).toBeNull();
  });
});
