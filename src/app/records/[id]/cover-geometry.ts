import { BANDS, GRID_FORK, IDENTITY_SPANS, GRID_COLUMNS } from './band-geometry';

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
 * **The column runs to the band's foot.** The bar is 26 → 398 and the block
 * 398 → 547; both are positioned against the cell, not its padding, so the 26
 * applies to their top and not their bottom. The drawings first ended the
 * block at 544, 3px short of the foot, which the render does not do and which
 * read as a fourth dimension nobody had named — that was the "open input"
 * this note once carried, and §23 as tracked closes it. The band is 547 and
 * §23 does not change it; it is the denominator for §9.2's gate and the
 * floor's re-measurement, so it is stated rather than implied.
 */

/** The cell, derived from the spans so it cannot drift from the band. */
export const COVER_CELL = (GRID_FORK / GRID_COLUMNS) * IDENTITY_SPANS[2];

export const COVER_PAD = 26;
export const COVER = 414;
export const COVER_GAP = 10;
export const COVER_COLUMN = 30;

/** The bar's ruled extent: 26 → 398, which is the 30 × 372 §23 costs at 13%. */
export const BAR_BOTTOM = 398;
/**
 * The block's ruled extent: 398 → the band's foot. The band is 547 and its
 * last pixel is the rule between the bands (§3), so the CELL the block is
 * positioned against ends at 546; drawn to 547 it was clipped by that pixel.
 * Derived from the band, so the foot cannot drift from it.
 */
export const BLOCK_BOTTOM = BANDS.identity - 1;
