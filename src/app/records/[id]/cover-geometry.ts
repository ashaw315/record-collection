import { GRID_FORK, IDENTITY_SPANS, GRID_COLUMNS } from './band-geometry';

/**
 * **§23: the cover cell's geometry, ruled rather than left to the span.**
 *
 * The cell is four columns, 480 at the fork, and it closes as
 * 26 + 414 + 10 + 30. The cover is 414 square. The sleeve bar and the black
 * block share ONE 30px column at the cell's right edge — bar above, block
 * below — which is how the supplied render draws them. The file had drawn
 * them side by side, bar at right 38 and block at right 0, which needed 58px
 * beside the cover that a 480 cell does not have.
 *
 * The costs, named, because §23 corrects exactly an unnamed loss: the cover
 * goes 448 → 414 in the drawings, 8% linear; the bar goes 30 × 430 → 30 × 372,
 * 13% of its area. The bar is §5.5's floor-exempt mark, bounded by the sleeve
 * it sits beside, and remains one of the band's two base marks.
 *
 * **One open input, recorded here rather than resolved.** The ruled column
 * runs 26 → 398 → 544. That sits inside the 547 band, so nothing overflows;
 * what does not close is the bottom padding — 3 against the top's 26 — and
 * Design has been asked whether the band is 547 or 570. The figures below are
 * §23's as written. An unnamed dimensional change in this band is what cost
 * the last four rulings, so none is made here.
 */

/** The cell, derived from the spans so it cannot drift from the band. */
export const COVER_CELL = (GRID_FORK / GRID_COLUMNS) * IDENTITY_SPANS[2];

export const COVER_PAD = 26;
export const COVER = 414;
export const COVER_GAP = 10;
export const COVER_COLUMN = 30;

/** The bar's ruled extent: 26 → 398, which is the 30 × 372 §23 costs at 13%. */
export const BAR_BOTTOM = 398;
/** The block's ruled extent: 398 → 544. */
export const BLOCK_BOTTOM = 544;
