import { describe, expect, it } from 'vitest';
import { contentHeight, genresRun, shouldCollapse, COLLAPSE_TOLERANCE } from './genres-run';

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

  it('fires at exactly fitting, because an exact fit is the coincidence the tolerance guards', () => {
    expect(shouldCollapse({ needed: 510, available: 510 })).toBe(true);
  });

  it('fires when the content overflows the space the track has already given up', () => {
    expect(shouldCollapse({ needed: 515.5, available: 510 })).toBe(true);
  });

  it('holds §28’s 4px tolerance as a guard against a coincidental PASS', () => {
    /**
     * §28: "The trigger measures the cell, not the content track, with a 4px
     * tolerance. **The tolerance stays as a guard against a coincidental
     * pass**, but no record is near it."
     *
     * **The direction is load-bearing and it was backwards.** A guard against
     * a coincidental pass makes the collapse fire MORE readily: a record that
     * clears the cell by a hair is not really fitting, so its run yields.
     * Applied the other way — as slack before the collapse fires — it
     * suppressed the collapse on the collection's worst title at 2px over,
     * and the genres run CLIPPED by 0.9px instead of yielding, inverting
     * §27's "never overflow-hidden".
     */
    expect(COLLAPSE_TOLERANCE).toBe(4);
    expect(shouldCollapse({ needed: 512, available: 510 }), 'over the cell: the run yields').toBe(true);
    expect(shouldCollapse({ needed: 510, available: 510 }), 'exactly fitting is a coincidental pass').toBe(true);
    expect(shouldCollapse({ needed: 507, available: 510 }), 'clearing by 3 is still inside the tolerance').toBe(true);
    expect(shouldCollapse({ needed: 506, available: 510 }), 'clearing by more than 4 is a real fit').toBe(false);
    expect(shouldCollapse({ needed: 465, available: 510 }), '§28’s real good case, 45px of slack').toBe(false);
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

describe('what the trigger measures — the demand is the children’s sum (§28, §4.2)', () => {
  /**
   * **§28 removed the identity cell's ornament track, and that made demand
   * equal supply on every record.** The one remaining track is a flex column
   * with `justify-content: space-between`, which always fills its row and
   * distributes the remainder as a gap — so its height and its `scrollHeight`
   * are both meaningless as a measure of demand. Measured on the route: the
   * collection's worst title reports 512 and an ordinary record 511, one
   * pixel apart for records differing by 274px of real content.
   *
   * §4.2's own mechanism gives the answer. The pressing block anchors to the
   * floor, the title flows from the top, and "the two can never push each
   * other" holds precisely because the gap absorbs the title's growth. **A
   * gap that absorbs growth has a minimum of zero**, so the demand is the
   * title block plus the pressing block, on their own heights.
   *
   * The model reproduces a figure it was not fitted to: 510.9 against 510
   * available is +0.9, which is the 0.9px clip measured separately before any
   * of this was modelled.
   */
  it('is the sum of the content’s own children, never the track that holds them', () => {
    /* The measured tree at 1440 × 900: title block + pressing block. */
    expect(contentHeight({ childHeights: [394.9, 116] }), 'the collection’s worst title').toBeCloseTo(510.9, 1);
    expect(contentHeight({ childHeights: [191.8, 44.5] }), 'an ordinary short record').toBeCloseTo(236.3, 1);
  });

  it('separates the two records that the track’s own height cannot', () => {
    const available = 510;
    /*
      What the track reported for these same two records: 512 and 511. No
      threshold can part them, which is why the trigger fired on everything
      the moment the tolerance pointed the right way.
    */
    expect(shouldCollapse({ needed: 512, available }), 'by the track: the worst title collapses').toBe(true);
    expect(shouldCollapse({ needed: 511, available }), 'by the track: so does the ordinary record').toBe(true);

    /* By the children's sum they part by 274px, and only one collapses. */
    expect(shouldCollapse({ needed: 510.9, available }), 'the worst title yields its run').toBe(true);
    expect(shouldCollapse({ needed: 236.3, available }), 'the ordinary record keeps it').toBe(false);
  });

  it('counts no minimum for the gap, because the gap is what absorbs growth', () => {
    /*
      On the worst title the gap is already 0 and the demand is 510.9; on an
      ordinary record 273.7px of the track is gap. Counting any of it as
      demand would collapse records that have room — §4.2's reserved floor is
      a position, not a height the content owes.
    */
    const worst = contentHeight({ childHeights: [394.9, 116] });
    const ordinary = contentHeight({ childHeights: [191.8, 44.5] });
    expect(worst - ordinary, 'they differ by their content, not by their gap').toBeCloseTo(274.6, 1);
  });
});

describe('the give order applies only where the band has a fixed height (§28)', () => {
  /**
   * §28: "Below 480 the band has no fixed height at all, **so there the
   * height give order does not apply**."
   *
   * The build's single-column fork sets `height: auto` on the bands from
   * 1440 down, not from 480 — so between those widths the identity cell
   * shrink-wraps its content and demand equals supply EXACTLY. Measured at
   * 1280 on a record with three short fields: available 351, children's sum
   * 351, no slack anywhere. Any tolerance then fires the collapse on every
   * record, which is what took the genres off `record-detail.spec.ts`'s
   * fixtures.
   *
   * §28's principle is what settles it: a cell that grows to its content
   * cannot overflow, so there is nothing for the give order to protect
   * against and the run is always shown. The guard belongs to the fixed
   * band, and `fixedHeight` is how the caller says which it has.
   */
  it('does not fire on a cell that grows to its content, however tight the fit', () => {
    /* The measured 1280 case: demand and supply identical, and no collapse. */
    expect(shouldCollapse({ needed: 351, available: 351, fixedHeight: false })).toBe(false);
    /* Even genuinely over, which an auto cell cannot actually be. */
    expect(shouldCollapse({ needed: 400, available: 351, fixedHeight: false })).toBe(false);
  });

  it('still fires on the fixed band, which is where overflow is possible', () => {
    expect(shouldCollapse({ needed: 510.9, available: 510, fixedHeight: true }), 'the worst title').toBe(true);
    expect(shouldCollapse({ needed: 236.3, available: 510, fixedHeight: true }), 'an ordinary record').toBe(false);
  });

  it('defaults to the fixed band, so a caller that forgets gets the guard', () => {
    expect(shouldCollapse({ needed: 510.9, available: 510 })).toBe(true);
  });
});
