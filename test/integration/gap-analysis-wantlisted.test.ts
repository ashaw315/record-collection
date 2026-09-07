import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, wantList } from '@/db/schema';
import { gapAnalysisWithPrevious, storeGapAnalysis } from '@/lib/db/queries/gap-analysis';

/**
 * SPEC.md §9.2 (A47) — a stored answer is re-filtered when DISPLAYED.
 *
 * **The defect, reported from real use:** a record added to the want list was
 * still being suggested. The exclusion works on the wire — the payload carries
 * want-list titles and the prompt states a record-level prohibition — but a
 * STORED answer is a claim from the moment it was made, and want-listing a
 * record afterwards makes one of its lines a record the user has already
 * decided to hunt.
 *
 * **Marked, never dropped.** The panel is a TRANSCRIPT of what the model said,
 * not a live list — the same decision made when acting on a suggestion was kept
 * from removing it. A dropped line also hides the exclusion working, where a
 * marked one shows the user that they acted on it.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const SUGGESTIONS = [
  { artist: 'Massive Attack', title: 'Blue Lines', reason: 'r', genre: 'UK82' },
  { artist: 'Brian Eno', title: 'Another Green World', reason: 'r', genre: 'UK82' },
];

async function wantList_(artistName: string, title: string, isAcquired = false) {
  const [artist] = await db.insert(artists).values({ name: artistName }).returning();
  await db.insert(wantList).values({ title, artistId: artist.id, priority: 1, isAcquired });
}

describe('a stored answer marks what is now on the want list (A47)', () => {
  /**
   * Fails against: `hydrate` returning `row.suggestions` unflagged — the shipped
   * behaviour, which is the defect Adam reported.
   */
  it('flags a suggestion the user has since want-listed', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await wantList_('Massive Attack', 'Blue Lines');

    const { current } = await gapAnalysisWithPrevious();

    expect(current?.suggestions[0].onWantList).toBe(true);
  });

  /**
   * Fails against: a filter that DROPS rather than marks. The transcript must
   * keep every line the model returned, in the order it returned them.
   */
  it('KEEPS the suggestion, in place, rather than dropping it', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await wantList_('Massive Attack', 'Blue Lines');

    const { current } = await gapAnalysisWithPrevious();

    expect(current?.suggestions).toHaveLength(2);
    expect(current?.suggestions[0].artist).toBe('Massive Attack');
    expect(current?.suggestions[0].reason).toBe('r');
  });

  it('leaves a suggestion that is not want-listed unflagged', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await wantList_('Massive Attack', 'Blue Lines');

    const { current } = await gapAnalysisWithPrevious();

    expect(current?.suggestions[1].onWantList).toBe(false);
  });

  /**
   * Fails against: matching on artist alone. A29g welcomes a DIFFERENT record by
   * an owned artist, so one artist can appear with several titles — flagging all
   * of them because one is want-listed would mark a record the user has not
   * decided to hunt.
   */
  it('matches on artist AND title, never artist alone', async () => {
    await storeGapAnalysis({
      suggestions: [
        { artist: 'Brian Eno', title: 'Another Green World', reason: 'r', genre: 'UK82' },
        { artist: 'Brian Eno', title: 'Discreet Music', reason: 'r', genre: 'UK82' },
      ],
      dropped: 0,
    });
    await wantList_('Brian Eno', 'Discreet Music');

    const { current } = await gapAnalysisWithPrevious();

    expect(current?.suggestions[0].onWantList).toBe(false);
    expect(current?.suggestions[1].onWantList).toBe(true);
  });

  /**
   * Fails against: an exact-string match. The model's casing and spacing are its
   * own, and the user typed the want-list row by hand — two spellings of one
   * record must not read as two records.
   */
  it('matches case- and whitespace-insensitively', async () => {
    await storeGapAnalysis({
      suggestions: [{ artist: 'Massive Attack', title: 'Blue Lines', reason: 'r', genre: 'UK82' }],
      dropped: 0,
    });
    await wantList_('  massive attack ', 'BLUE LINES');

    const { current } = await gapAnalysisWithPrevious();

    expect(current?.suggestions[0].onWantList).toBe(true);
  });

  /**
   * Fails against: counting acquired rows. §7.3 makes the want list double as
   * acquisition history, and an acquired row is a record the user OWNS — the
   * suggestion is then stale for a different reason, and "now on your want
   * list" would be false.
   */
  it('ignores ACQUIRED want-list rows', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await wantList_('Massive Attack', 'Blue Lines', true);

    const { current } = await gapAnalysisWithPrevious();

    expect(current?.suggestions[0].onWantList).toBe(false);
  });

  /**
   * Fails against: marking only the current answer. The previous answer is
   * displayed too, and an unmarked line there is the same staleness one panel
   * down.
   */
  it('marks the PREVIOUS answer as well as the current one', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await storeGapAnalysis({
      suggestions: [{ artist: 'Donna Summer', title: 'I Feel Love', reason: 'r', genre: 'UK82' }],
      dropped: 0,
    });
    await wantList_('Massive Attack', 'Blue Lines');

    const { previous } = await gapAnalysisWithPrevious();

    expect(previous?.suggestions[0].onWantList).toBe(true);
  });

  /**
   * Fails against: a filter applied at STORAGE. The stored row must stay exactly
   * what the model returned, so the marking is recomputed against the want list
   * as it is NOW on every render — removing the row must unmark the line.
   */
  it('recomputes on every read rather than rewriting the stored row', async () => {
    await storeGapAnalysis({ suggestions: SUGGESTIONS, dropped: 0 });
    await wantList_('Massive Attack', 'Blue Lines');

    expect((await gapAnalysisWithPrevious()).current?.suggestions[0].onWantList).toBe(true);

    await db.delete(wantList);

    expect((await gapAnalysisWithPrevious()).current?.suggestions[0].onWantList).toBe(false);
  });
});
