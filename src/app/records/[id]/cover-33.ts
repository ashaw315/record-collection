import { BAR_BOTTOM, BLOCK_BOTTOM, COVER_CELL, COVER_PAD } from './cover-geometry';
import { BANDS } from './band-geometry';

/**
 * **The cell the cover actually has: 480 wide and 546 tall, not 547.**
 *
 * §33 says "At 1440 the cell is 480 × 547, so the cover is 480 × 480 and a
 * 67px strip remains beneath it." The band is 547, but its last pixel is the
 * rule between the bands (§3), so the CELL is 546 -- which is why §23 ended
 * the block at `BLOCK_BOTTOM`, 546, "the band's foot". Built to the band, the
 * block landed at 547 and spilled a pixel past its cell; the E2E caught it.
 * The strip is therefore 66 on the page. Reported to Design as the one-pixel
 * difference between the band and the cell, which §33's arithmetic did not
 * carry.
 */
export const SLEEVE_CELL = { width: COVER_CELL, height: BLOCK_BOTTOM } as const;

/**
 * §33's cover: "the largest square its cell holds, flush to the cell's top,
 * left and right, and never cropped."
 *
 * **This replaces §23's 26 + 414 + 10 + 30 division of the cell.** That
 * closure sized the cover for a column beside it; §33's reading of Adam's
 * capture is that the cover "is inset from its cell" and that each cell should
 * fit the record in front of it. At 1440 the square goes 414 → 480, and the
 * column that stood beside it rotates into the 67px strip left beneath.
 */

export interface Square {
  size: number;
  x: number;
  y: number;
}

export interface Strip {
  orientation: 'horizontal' | 'vertical';
  width: number;
  height: number;
  x: number;
  y: number;
}

/**
 * §23's column, as a ratio rather than as two pixel extents.
 *
 * §33: "the base bar and the black block keep their order and proportions,
 * now horizontal." The proportions are what survive the rotation, so they are
 * derived from §23's own figures — bar 26 → 398, block 398 → 547 — rather
 * than restated as new numbers that could drift from them.
 */
const BAR_EXTENT = BAR_BOTTOM - COVER_PAD;
const BLOCK_EXTENT = BANDS.identity - BAR_BOTTOM;

export const STRIP_SPLIT = {
  bar: BAR_EXTENT / (BAR_EXTENT + BLOCK_EXTENT),
  block: BLOCK_EXTENT / (BAR_EXTENT + BLOCK_EXTENT),
} as const;

/** The largest square the cell holds, flush to its top and both sides. */
export function coverSquare({ width, height }: { width: number; height: number }): Square {
  return { size: Math.min(width, height), x: 0, y: 0 };
}

/**
 * What is left once the square is taken.
 *
 * **Geometric, per §33**: the strip is horizontal when the cell is taller
 * than it is wide and vertical when it is wider, so "where the leftover falls
 * to the side instead, the strip is a column again, as it was" needs no
 * separate branch in the caller.
 */
export function leftoverStrip({ width, height }: { width: number; height: number }): Strip {
  const size = Math.min(width, height);
  if (height >= width) {
    return { orientation: 'horizontal', width, height: height - size, x: 0, y: size };
  }
  return { orientation: 'vertical', width: width - size, height, x: size, y: 0 };
}
