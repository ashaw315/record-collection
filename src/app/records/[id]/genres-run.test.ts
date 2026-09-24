import { describe, expect, it } from 'vitest';
import { genresRun, shouldCollapse, COLLAPSE_TOLERANCE } from './genres-run';

const GENRES = [
  { id: 'g1', name: 'Disco' },
  { id: 'g2', name: 'Soul' },
  { id: 'g3', name: 'Pop' },
];

describe('the genres run (§4.2)', () => {
  it('shows every genre and counts nothing while there is room', () => {
    const run = genresRun(GENRES, false);

    expect(run.shown.map((g) => g.name)).toEqual(['Disco', 'Soul', 'Pop']);
    expect(run.hidden).toBe(0);
  });

  it('collapses to a count of the genres NOT shown', () => {
    /**
     * **The count is the number withheld, not the total.** A count that says
     * three when three are visible is the defect this vocabulary exists to
     * prevent: it tells the reader a fact is withheld when it is on the page.
     * Full collapse hides all three, so the count is three — but by
     * subtraction from what is shown, never by reading the length.
     */
    const run = genresRun(GENRES, true);

    expect(run.shown).toEqual([]);
    expect(run.hidden).toBe(3);
  });

  it('never counts a genre that is shown', () => {
    /* The invariant, over both states: shown + hidden is the total, and
       hidden is zero exactly when everything is shown. */
    for (const collapsed of [false, true]) {
      const run = genresRun(GENRES, collapsed);

      expect(run.shown.length + run.hidden, 'nothing lost, nothing double-counted').toBe(
        GENRES.length,
      );
      if (run.shown.length === GENRES.length) {
        expect(run.hidden, 'all visible means nothing withheld').toBe(0);
      }
    }
  });

  it('has nothing to count on a record with no genres', () => {
    expect(genresRun([], true)).toEqual({ shown: [], hidden: 0 });
  });
});

describe('when the run collapses', () => {
  /**
   * **The third give, and only the third.** §4.2's order is: the title→pressing
   * gap absorbs first, then the corner ornament track, then the genres run
   * collapses. The first two are geometry the cell does for itself; the collapse
   * is the one that costs a fact, so it fires only when the content still does
   * not fit with the track already at zero.
   */
  it('does not fire while the content fits', () => {
    expect(shouldCollapse({ needed: 483, available: 510 })).toBe(false);
  });

  it('does not fire at exactly fitting', () => {
    expect(shouldCollapse({ needed: 510, available: 510 })).toBe(false);
  });

  it('fires when the content overflows the space the track has already given up', () => {
    expect(shouldCollapse({ needed: 515.5, available: 510 })).toBe(true);
  });

  it('holds §28’s 4px tolerance, so a coincidental fit does not pass for a real one', () => {
    /*
      §28: "The trigger measures the cell, not the content track, with a 4px
      tolerance. The tolerance stays as a guard against a coincidental pass,
      but no record is near it." A shortfall inside the tolerance is not a
      shortfall — the 0.4px margin that prompted this was measured on a
      suffixed fixture and the real good case has about 45px of slack.
    */
    expect(COLLAPSE_TOLERANCE).toBe(4);
    expect(shouldCollapse({ needed: 512, available: 510 }), '2px over is within the tolerance').toBe(false);
    expect(shouldCollapse({ needed: 514, available: 510 }), 'and 4px still is').toBe(false);
    expect(shouldCollapse({ needed: 514.5, available: 510 }), 'past it, the run collapses').toBe(true);
  });

  it('is the condition, not a line count', () => {
    /*
      The run collapses when the track has resolved to 0 and the remaining
      growth still exceeds the gap. "Five lines" was a proxy for that and fires
      wrongly the moment the type stack or the measure moves — which happened:
      the drawing's threshold rested on a stack ~69px taller than the build's.
      The rule sees a shortfall or none, at any line count.
    */
    expect(shouldCollapse({ needed: 100, available: 90 })).toBe(true);
    expect(shouldCollapse({ needed: 900, available: 950 })).toBe(false);
  });
});
