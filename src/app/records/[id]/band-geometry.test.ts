import { describe, expect, it } from 'vitest';
import {
  BANDS,
  BAND_TOTAL,
  IDENTITY_SPANS,
  LOWER_SPANS,
  NO_SCROLL_HEIGHT,
  columnWidth,
  spanWidth,
} from './band-geometry';

/**
 * 8a §2.1 — three fixed bands and twelve columns, at 1440 × 900.
 *
 * **The total is the bet, and the total alone is not enough.** 53 + 547 + 300
 * = 900 is the whole no-scroll claim, and a test that checks each band
 * separately passes while the sum drifts — so the sum is pinned first and the
 * parts second.
 *
 * **The reverse just happened, which is why the parts are pinned at all.** The
 * identity band took the tail's 47px (500 → 547, tail → 0) and the total
 * stayed exactly 900. A suite asserting only `BAND_TOTAL === 900` passes on
 * both the old bands and the new ones, and would have reported a screen built
 * to the wrong numbers as correct.
 *
 * Heights are FIXED, not content-derived: the lower band is 300px whether five
 * cells carry text or one does, which is what makes §6 a question about marks
 * rather than about reflow. The tail is paper, not a footer — nothing is drawn
 * in it.
 */

describe('the no-scroll budget (§2.1)', () => {
  /**
   * **THE assertion.** Everything else in this file is a part of this sum, and
   * this is the line that fails if any of them moves without a compensating
   * change elsewhere.
   */
  it('spends exactly the viewport and no more', () => {
    expect(BAND_TOTAL).toBe(NO_SCROLL_HEIGHT);
    expect(BAND_TOTAL).toBe(900);
  });

  it('is the sum of the declared bands', () => {
    const summed = BANDS.nav + BANDS.identity + BANDS.record + BANDS.tail;

    expect(summed, '53 + 547 + 300 + 0').toBe(BAND_TOTAL);
  });

  /**
   * The nav is 53 because the built `AppHeader` measures 53 — 8a's drawing
   * showed 56, and the file states that a spec restating a measurable
   * component's height wrongly is worse than one that omits it. The three
   * pixels went to the tail, the only band with nothing drawn in it.
   */
  it('takes the nav height from the built component, not the drawing', () => {
    expect(BANDS.nav, 'the measured AppHeader').toBe(53);
  });

  it('gives the identity band the tail, because the give had to ADD height', () => {
    /**
     * **500 → 547, and the tail is gone.**
     *
     * 140px of reserve could not absorb 203px of title growth, so the shortfall
     * had to add height to the band rather than be reallocated inside it. The
     * tail was the only band that could give, and it gave all of it.
     */
    expect(BANDS.identity, 'took the tail').toBe(547);
    expect(BANDS.record).toBe(300);
    expect(BANDS.tail, 'spent').toBe(0);
  });

  it('closes the screen on the record band rather than on paper', () => {
    /**
     * **The fold is a composition edge, and it moved.** With a 47px tail the
     * screen ended on empty paper; with no tail it ends on the record band's
     * closing rule — the edge every other band ends on.
     *
     * Asserted as "the last band drawn reaches the fold", which is what that
     * sentence means geometrically.
     */
    expect(BANDS.nav + BANDS.identity + BANDS.record, 'the drawn bands reach the fold').toBe(
      NO_SCROLL_HEIGHT,
    );
  });

  it('leaves no slack for a band to grow into', () => {
    /*
      There is no longer ANY give: the tail was the only band drawing nothing
      and it has been spent. Any further growth has to come out of a band with
      content in it, which is a composition decision rather than an adjustment.
    */
    const drawn = BANDS.nav + BANDS.identity + BANDS.record;

    expect(NO_SCROLL_HEIGHT - drawn, 'all the give there is').toBe(0);
  });
});

describe('twelve columns at 1440 (§2.1)', () => {
  it('is a 120px column', () => {
    expect(columnWidth(1440)).toBe(120);
  });

  /**
   * §2.1 is explicit that the drawing is not on a twelve-column grid and the
   * build is: measured off the raster the upper dividers fall at 451 and 888
   * against the grid's 480 and 840. The rounding is stated rather than hidden
   * because it is visible — the identity cell gains 29px and the figures cell
   * loses 51.
   */
  it('puts the upper band on the grid rather than on the raster', () => {
    const [identity, still, sleeve] = IDENTITY_SPANS;

    expect(identity + still + sleeve, 'twelve columns').toBe(12);
    expect(spanWidth(identity, 1440), 'the raster had 451').toBe(480);
    expect(spanWidth(identity + still, 1440), 'the raster had 888').toBe(840);
  });

  it('divides the lower band 3 / 2 / 2 / 2 / 3', () => {
    expect([...LOWER_SPANS]).toEqual([3, 2, 2, 2, 3]);
    expect(LOWER_SPANS.reduce((a, b) => a + b, 0)).toBe(12);
  });

  /**
   * The proportions the composition is doing, which survive the rounding:
   * widest at both ends, the two narrow interior cells flanking the figures.
   */
  it('is widest at both ends of the lower band', () => {
    const widths = LOWER_SPANS.map((span) => spanWidth(span, 1440));

    expect(widths[0]).toBeGreaterThan(widths[1]);
    expect(widths[4]).toBeGreaterThan(widths[3]);
    expect(widths[0]).toBe(widths[4]);
  });

  it('scales with the viewport rather than assuming 1440', () => {
    // The page bleeds — there is no centred container — so a column is a
    // fraction of whatever the viewport is.
    expect(columnWidth(1200)).toBe(100);
    expect(spanWidth(3, 1200)).toBe(300);
  });
});
