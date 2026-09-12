import { describe, expect, it } from 'vitest';
import { shelfRuns } from './shelf-runs';

/**
 * **What this protects, in the design file's own words:**
 *
 * > "the shelf polygon is generated per run, from the section runs, and the
 * > pull must not be allowed to split a run. **A pull that shortens its run
 * > produces a section break that says a group ended.**"
 *
 * That is the failure, and it is a failure of MEANING rather than of geometry.
 * §2 of the drawing sets the two absences against each other: between groups
 * the shelf outline stops and restarts, because there is no shelf there; within
 * a group it runs unbroken under an empty slot, because the shelf is still
 * there and the record is not on it. Same mark, different owner.
 *
 * So a pull that splits a run does not merely draw a smaller polygon — it draws
 * the OTHER absence. The wall says a group ended where none did, in a mark the
 * reader has been taught to trust. A count that is merely wrong is a bug; this
 * one lies in the wall's own vocabulary, which is why it is asserted directly
 * rather than left to a review.
 */

type Seat = { id: string; section: string };

const seats = (...spec: string[]): Seat[] =>
  spec.map((entry, index) => {
    const [section] = entry.split(':');
    return { id: `r${index}`, section };
  });

/**
 * A shelf of three sections: two of three, one of one.
 *
 * **`a2` is deliberately NOT adjacent to `a1`.** A fixture whose sections are
 * each one contiguous block cannot express the bug this file is named for: with
 * such a shelf, filtering the pulled record out and regrouping by adjacency
 * produces exactly the right answer, and the naive implementation passes every
 * assertion here. The first version of this fixture was that shelf, and the
 * staged bug went green against all thirteen tests.
 *
 * So the Jazz section is INTERLEAVED with Punk. That is not contrived: shelf
 * order is artist-then-year within a section, and §10b's ordering places
 * sections by their alphabetically-first top-level ancestor — a record
 * resolving to more than one ancestor sits between records of another section,
 * which NOTES records as the common case (9 of 17 real records resolve to more
 * than one).
 */
const SHELF: Seat[] = [
  { id: 'a1', section: 'Jazz' },
  { id: 'b1', section: 'Punk' },
  { id: 'a2', section: 'Jazz' },
  { id: 'b2', section: 'Punk' },
  { id: 'a3', section: 'Jazz' },
  { id: 'b3', section: 'Punk' },
  { id: 'c1', section: 'Soul' },
];

describe('the seated arrangement', () => {
  it('makes one run per section', () => {
    const runs = shelfRuns(SHELF, null);

    expect(runs).toHaveLength(3);
    expect(runs.map((run) => run.section)).toEqual(['Jazz', 'Punk', 'Soul']);
    expect(runs.map((run) => run.length)).toEqual([3, 3, 1]);
  });

  it('keeps every seated record in its run, in order', () => {
    const runs = shelfRuns(SHELF, null);

    expect(runs[0].ids).toEqual(['a1', 'a2', 'a3']);
    expect(runs[2].ids).toEqual(['c1']);
  });
});

/**
 * **THE INVARIANT.** A pull removes a record from the shelf, and the run it
 * left must still be ONE run — shorter by one, never two.
 */
describe('a pull never splits a run', () => {
  it('leaves the run count unchanged when the pulled record is mid-run', () => {
    /*
      The load-bearing case. `a2` sits between `a1` and `a3`, so a naive
      implementation that filters the pulled record out and then groups
      CONSECUTIVE seats produces two Jazz runs — a section break that says the
      Jazz group ended in the middle of itself.
    */
    const seated = shelfRuns(SHELF, null);
    const pulled = shelfRuns(SHELF, 'a2');

    expect(pulled, 'a mid-run pull must not add a run').toHaveLength(seated.length);
    expect(pulled.map((run) => run.section)).toEqual(['Jazz', 'Punk', 'Soul']);
  });

  it('keeps the mid-run gap INSIDE the run rather than between two runs', () => {
    // The shelf is still there and the record is not on it: one run, one
    // shorter, with the remaining records still its members.
    const [jazz] = shelfRuns(SHELF, 'a2');

    expect(jazz.length).toBe(2);
    expect(jazz.ids).toEqual(['a1', 'a3']);
  });

  it('leaves the run count unchanged when the pulled record is first in its run', () => {
    const pulled = shelfRuns(SHELF, 'a1');

    expect(pulled).toHaveLength(3);
    expect(pulled[0].ids).toEqual(['a2', 'a3']);
  });

  it('leaves the run count unchanged when the pulled record is last in its run', () => {
    const pulled = shelfRuns(SHELF, 'a3');

    expect(pulled).toHaveLength(3);
    expect(pulled[0].ids).toEqual(['a1', 'a2']);
  });

  /**
   * **The one case where a run legitimately disappears.** A section of one,
   * pulled, leaves no shelf — and that IS a stop-and-restart, because there is
   * genuinely nothing on that stretch of shelf. The invariant says a pull must
   * not ADD a run; it does not say a section with no seated records must keep
   * drawing an empty one.
   */
  it('drops a single-record run entirely rather than drawing an empty shelf', () => {
    const pulled = shelfRuns(SHELF, 'c1');

    expect(pulled).toHaveLength(2);
    expect(pulled.map((run) => run.section)).toEqual(['Jazz', 'Punk']);
    expect(pulled.every((run) => run.length > 0)).toBe(true);
  });

  it('is unchanged by a pulled id that is not on the shelf', () => {
    expect(shelfRuns(SHELF, 'not-here')).toEqual(shelfRuns(SHELF, null));
  });

  /**
   * The invariant stated as a property and checked at EVERY seat, so a future
   * implementation cannot satisfy the named cases and break an unnamed one.
   */
  it('holds at every seat on the shelf', () => {
    const seated = shelfRuns(SHELF, null);

    for (const seat of SHELF) {
      const pulled = shelfRuns(SHELF, seat.id);
      const sectionSize = SHELF.filter((other) => other.section === seat.section).length;

      /* Pulling the only record of a section removes that run; never any other. */
      const expected = sectionSize === 1 ? seated.length - 1 : seated.length;

      expect(pulled.length, `pulling ${seat.id} from a section of ${sectionSize}`).toBe(expected);
      expect(pulled.some((run) => run.ids.includes(seat.id)), `${seat.id} is off the shelf`).toBe(
        false,
      );
    }
  });

  it('never produces two runs of the same section', () => {
    // The direct statement of the lie: two runs of one section IS the section
    // break that says a group ended.
    for (const seat of [...SHELF.map((s) => s.id), null]) {
      const sections = shelfRuns(SHELF, seat).map((run) => run.section);
      expect(new Set(sections).size, `pulling ${seat ?? 'nothing'}`).toBe(sections.length);
    }
  });
});

describe('an empty or single-section shelf', () => {
  it('has no runs when there are no records', () => {
    expect(shelfRuns([], null)).toEqual([]);
    expect(shelfRuns([], 'anything')).toEqual([]);
  });

  it('keeps one run when the whole shelf is one section', () => {
    const single = seats('Jazz', 'Jazz', 'Jazz');
    // Contiguous by definition here — the interleaved case is SHELF above.

    expect(shelfRuns(single, null)).toHaveLength(1);
    expect(shelfRuns(single, 'r1')).toHaveLength(1);
    expect(shelfRuns(single, 'r1')[0].length).toBe(2);
  });

  it('empties the shelf when the only record is pulled', () => {
    expect(shelfRuns(seats('Jazz'), 'r0')).toEqual([]);
  });
});
