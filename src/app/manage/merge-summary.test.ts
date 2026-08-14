import { describe, expect, it } from 'vitest';
import { mergeSummary, type MergePlanLike } from './merge-summary';

/** Most cases here vary the PLAN, not the two artists — this fixes the sides. */
const mergeSummary2 = (plan: MergePlanLike) =>
  mergeSummary(plan, { survivor: KEEPER, loser: LOSER });

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

/** Two rows with the same name — the only case this screen ever shows. */
const KEEPER = {
  id: 'keeper',
  name: 'Discharge',
  recordCount: 11,
  formedYear: 1977,
  originCountry: 'GB',
  musicbrainzId: null,
};
const LOSER = {
  id: 'loser',
  name: 'Discharge',
  recordCount: 0,
  formedYear: null,
  originCountry: null,
  musicbrainzId: '0c9bfbdc-4e64-497d-bf80-5c891e6766a3',
};

describe('what moves', () => {
  it('names the records, which are what the user cares about most', () => {
    const said = mergeSummary2({ ...empty, moves: { ...empty.moves, records: 11 } });

    expect(said.moves).toContain('11 records');
  });

  it('uses singular for one', () => {
    const said = mergeSummary2({ ...empty, moves: { ...empty.moves, records: 1 } });

    expect(said.moves).toContain('1 record');
    expect(said.moves).not.toContain('1 records');
  });

  it('omits categories that are empty rather than saying zero', () => {
    // "0 want-list entries" is noise that buries the line that matters.
    const said = mergeSummary2({ ...empty, moves: { ...empty.moves, records: 3 } });

    expect(said.moves).toContain('3 records');
    expect(said.moves).not.toMatch(/0 /);
    expect(said.moves, 'and does not repeat what `keeping` says').not.toMatch(
      /duplicate artist row/i,
    );
  });
});

describe('what is DESTROYED', () => {
  it('names discarded duplicate tags, and says WHY they are discarded', () => {
    /**
     * The load-bearing case. A user who is told "3 genre tags will be
     * discarded" and not why would reasonably think the merge is losing their
     * data — the reason is that the survivor already has them.
     */
    const said = mergeSummary2({
      ...empty,
      discards: { ...empty.discards, duplicateGenres: 3 },
    });

    expect(said.discards).toContain('3 genre tags');
    expect(said.discards, 'the reason, not just the count').toMatch(/already|duplicate/i);
  });

  it('names discarded edges between the two artists', () => {
    const said = mergeSummary2({ ...empty, discards: { ...empty.discards, selfEdges: 2 } });

    expect(said.discards).toMatch(/2 (links|connections|edges)/i);
  });

  it('is null when nothing is destroyed, so the warning means something', () => {
    /**
     * A permanently visible "nothing will be lost" trains the user to skip the
     * line — and then the one merge that DOES discard something reads the same
     * as the ones that do not.
     */
    const said = mergeSummary2({ ...empty, moves: { ...empty.moves, records: 2 } });

    expect(said.discards).toBeNull();
  });
});

describe('the irreversibility', () => {
  it('says the merge cannot be undone, in those words', () => {
    // The delete confirmation's precedent: name the permanence, do not imply it
    // with a generic "are you sure?".
    const said = mergeSummary2(empty);

    expect(said.warning).toMatch(/cannot be undone|permanent|irreversible/i);
  });

  it('says it even when nothing moves', () => {
    /**
     * An empty merge still destroys an artist row. A confirmation that fell
     * silent here would be silent in exactly the case where the user has least
     * evidence that anything is happening.
     */
    const said = mergeSummary(empty, { survivor: KEEPER, loser: LOSER });

    expect(said.warning).not.toBe('');
    // The row's destruction is named in `keeping`, which identifies WHICH row.
    expect(said.keeping, 'and says the artist row itself goes').toMatch(/will be deleted/i);
  });
});

describe('naming WHICH artist survives', () => {
  /**
   * **The premise of this whole screen is that names carry no information
   * here** — a pair is a candidate because the names are identical. So "the
   * duplicate will be deleted" is not a decidable sentence: the user cannot
   * tell which of two rows called Discharge they are keeping.
   *
   * The confirmation names the survivor the way the review names the
   * candidates: by the facts that actually separate them.
   */

  it('identifies the survivor by record count, not by name', () => {
    const said = mergeSummary(empty, { survivor: KEEPER, loser: LOSER });

    expect(said.keeping, 'the surviving row, in decidable terms').toMatch(/11 records/);
    expect(said.keeping, 'and what goes').toMatch(/0 records/);
  });

  it('does not rely on the name, which is identical by construction', () => {
    const said = mergeSummary(empty, { survivor: KEEPER, loser: LOSER });

    // The name may appear as a label, but it can never be the DISTINGUISHING
    // fact — both rows carry it.
    const withoutNames = said.keeping.replaceAll('Discharge', '');
    expect(withoutNames, 'still decidable with the names removed').toMatch(/11 records/);
    expect(withoutNames).toMatch(/0 records/);
  });

  it('names the other separating facts when records tie', () => {
    /**
     * A tie on records breaks on creation date, which the user cannot see. So
     * the remaining facts have to carry the decision — otherwise the sentence
     * is "keeping one of these two identical things".
     */
    const said = mergeSummary(empty, {
      survivor: { ...KEEPER, recordCount: 0, formedYear: 1977, originCountry: 'GB' },
      loser: { ...LOSER, recordCount: 0, formedYear: 1980, originCountry: 'US' },
    });

    expect(said.keeping).toMatch(/1977/);
    expect(said.keeping).toMatch(/GB/);
  });

  it('says when the survivor gains the MusicBrainz id', () => {
    /**
     * The survivor rule made visible: the row with the records survives and the
     * identity moves onto it. A user who sees "keeping the row with 11 records"
     * and knows the OTHER had the MusicBrainz id would reasonably fear losing
     * it — saying it moves is what makes the choice legible.
     */
    const said = mergeSummary(empty, { survivor: KEEPER, loser: LOSER });

    expect(said.keeping).toMatch(/MusicBrainz/i);
  });

  it('does not claim the id moves when the survivor already has one', () => {
    const said = mergeSummary(empty, {
      survivor: { ...KEEPER, musicbrainzId: 'already-has-one' },
      loser: { ...LOSER, musicbrainzId: null },
    });

    /**
     * Asserted against the ACTUAL sentence, not a paraphrase of it. The first
     * version of this test matched `/will be kept|moves across|gains/i` while
     * the copy says "moves to" — so it could not fail, and a mutation showing
     * the line unconditionally passed.
     */
    expect(said.keeping, 'nothing to move').not.toMatch(/MusicBrainz/i);
  });
});
