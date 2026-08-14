import { describe, expect, it } from 'vitest';
import { mergeSummary } from './merge-summary';

/**
 * The merge confirmation (SPEC.md §4.3, and the delete confirmation's
 * precedent).
 *
 * **Merging is irreversible, so the confirmation must name what is DESTROYED,
 * not only what moves.** "3 genre tags will be discarded because they duplicate
 * the survivor's" is the difference between an informed merge and a surprise.
 * Unlike "different artists" — a recorded opinion that can be revisited — this
 * deletes a row.
 */

const empty = {
  moves: { records: 0, wantList: 0, genres: 0, memberships: 0, influences: 0 },
  discards: { duplicateGenres: 0, selfEdges: 0 },
  irreversible: true as const,
};

describe('what moves', () => {
  it('names the records, which are what the user cares about most', () => {
    const said = mergeSummary({ ...empty, moves: { ...empty.moves, records: 11 } });

    expect(said.moves).toContain('11 records');
  });

  it('uses singular for one', () => {
    const said = mergeSummary({ ...empty, moves: { ...empty.moves, records: 1 } });

    expect(said.moves).toContain('1 record');
    expect(said.moves).not.toContain('1 records');
  });

  it('omits categories that are empty rather than saying zero', () => {
    // "0 want-list entries" is noise that buries the line that matters.
    const said = mergeSummary({ ...empty, moves: { ...empty.moves, records: 3 } });

    expect(said.moves).toContain('3 records');
    expect(said.moves).not.toMatch(/0 /);
  });
});

describe('what is DESTROYED', () => {
  it('names discarded duplicate tags, and says WHY they are discarded', () => {
    /**
     * The load-bearing case. A user who is told "3 genre tags will be
     * discarded" and not why would reasonably think the merge is losing their
     * data — the reason is that the survivor already has them.
     */
    const said = mergeSummary({
      ...empty,
      discards: { ...empty.discards, duplicateGenres: 3 },
    });

    expect(said.discards).toContain('3 genre tags');
    expect(said.discards, 'the reason, not just the count').toMatch(/already|duplicate/i);
  });

  it('names discarded edges between the two artists', () => {
    const said = mergeSummary({ ...empty, discards: { ...empty.discards, selfEdges: 2 } });

    expect(said.discards).toMatch(/2 (links|connections|edges)/i);
  });

  it('is null when nothing is destroyed, so the warning means something', () => {
    /**
     * A permanently visible "nothing will be lost" trains the user to skip the
     * line — and then the one merge that DOES discard something reads the same
     * as the ones that do not.
     */
    const said = mergeSummary({ ...empty, moves: { ...empty.moves, records: 2 } });

    expect(said.discards).toBeNull();
  });
});

describe('the irreversibility', () => {
  it('says the merge cannot be undone, in those words', () => {
    // The delete confirmation's precedent: name the permanence, do not imply it
    // with a generic "are you sure?".
    const said = mergeSummary(empty);

    expect(said.warning).toMatch(/cannot be undone|permanent|irreversible/i);
  });

  it('says it even when nothing moves', () => {
    /**
     * An empty merge still destroys an artist row. A confirmation that fell
     * silent here would be silent in exactly the case where the user has least
     * evidence that anything is happening.
     */
    const said = mergeSummary(empty);

    expect(said.warning).not.toBe('');
    expect(said.moves, 'and says the artist itself goes').toMatch(/artist/i);
  });
});
