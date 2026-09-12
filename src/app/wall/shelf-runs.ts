/**
 * The shelf's runs — one unbroken polygon per section (SPEC.md §10b).
 *
 * **The pull must not be allowed to split a run.** §2 of the drawing sets the
 * two absences against each other: between groups the shelf outline stops and
 * restarts, because there is no shelf there; within a group it runs unbroken
 * under an empty slot, because the shelf is still there and the record is not
 * on it. Same mark, different owner, distinguished only by which element
 * carries it.
 *
 * So the failure this module exists to prevent is a failure of MEANING. A pull
 * that shortens its run into two produces a section break that says a group
 * ended — the wall lying in the vocabulary it taught the reader to trust.
 *
 * **Which is why a run is grouped by SECTION and not by adjacency.** Filtering
 * the pulled record out and then grouping consecutive seats is the obvious
 * implementation and it is the bug: it turns a gap in a group into a boundary
 * between groups.
 */

/** A record's seat on the shelf, in shelf order. */
export type ShelfSeat = {
  id: string;
  /**
   * The section this seat belongs to — §10b's top-level genre ancestor.
   *
   * Supplied by the caller rather than read off `ShelfRecord`, which drops
   * `sectionName` deliberately so nothing can render the headings §10b removed.
   * The runs need the boundaries; the screen still never shows their names.
   */
  section: string;
};

/** One unbroken stretch of shelf, carrying the records still seated on it. */
export type ShelfRun = {
  section: string;
  /** Seated records, in shelf order. Excludes the pulled one. */
  ids: string[];
  /** How many records are seated on this run. Never zero. */
  length: number;
};

/**
 * The runs a shelf draws, with at most one record pulled.
 *
 * A run disappears only when its section has no seated records left — that is a
 * genuine stop-and-restart, because nothing is on that stretch of shelf. It
 * never SPLITS.
 */
export function shelfRuns(seats: readonly ShelfSeat[], pulledId: string | null): ShelfRun[] {
  const runs: ShelfRun[] = [];
  const bySection = new Map<string, ShelfRun>();

  for (const seat of seats) {
    /*
      The section is registered from the SEATED arrangement, before the pull is
      applied — so the run's identity does not depend on which record is out.
    */
    let run = bySection.get(seat.section);
    if (run === undefined) {
      run = { section: seat.section, ids: [], length: 0 };
      bySection.set(seat.section, run);
      runs.push(run);
    }

    if (seat.id === pulledId) continue;

    run.ids.push(seat.id);
    run.length += 1;
  }

  /* A section with nothing seated draws no shelf at all. */
  return runs.filter((run) => run.length > 0);
}
