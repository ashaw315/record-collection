/** §T.6: "a 24 margin on every side where it meets anything drawn", §G.3's gap. */
export const AIR_MARGIN = 24;

type Box = { left: number; top: number; right: number; bottom: number };

/** What bounds the air on the table and the grid, in one frame of reference. */
export type AirBounds = {
  /** The app header's foot. */
  headerFoot: number;
  /** The right edge of the widest thing drawn in the band's column: the search field, the heading, the filters. */
  columnRight: number;
  /** Add record, at the band's right. Null where it is not drawn. */
  add: Box | null;
  /** The top of the first thing the list draws: a header's label, or a cover. */
  listTop: number;
  /** The window's right edge, which is not drawn and takes no margin. */
  edge: number;
};

export type HeadingAir = { left: number; top: number; width: number; height: number; /** The figure's height in that air. */ figure: number };

/**
 * §T.6: "The heading's figure takes the air right of the band at the
 * largest height that air holds, and is drawn only where that height is at
 * least the height at which its construction's narrowest face clears §29's
 * 6px." Where it is not, "there is no figure, not a simplified one".
 *
 * Add record stands in the air, so there are two rectangles to choose
 * from: beside it, from under the header; or under it, to the window's
 * edge. The one that holds the taller figure is the air. A figure keeps its
 * proportion, so its height in a rectangle is the rectangle's, or what the
 * rectangle's width allows.
 */
export function headingAir(bounds: AirBounds, aspect: number, clearingHeight: number): HeadingAir | null {
  const left = bounds.columnRight + AIR_MARGIN;
  const bottom = bounds.listTop - AIR_MARGIN;
  const under = bounds.headerFoot + AIR_MARGIN;
  const candidates: Box[] =
    bounds.add === null
      ? [{ left, top: under, right: bounds.edge, bottom }]
      : [
          { left, top: under, right: bounds.add.left - AIR_MARGIN, bottom },
          { left, top: Math.max(under, bounds.add.bottom + AIR_MARGIN), right: bounds.edge, bottom },
        ];
  let best: HeadingAir | null = null;
  for (const box of candidates) {
    const width = box.right - box.left;
    const height = box.bottom - box.top;
    if (width <= 0 || height <= 0) continue;
    const figure = Math.min(height, width / aspect);
    if (best === null || figure > best.figure) best = { left: box.left, top: box.top, width, height, figure };
  }
  return best !== null && best.figure >= clearingHeight ? best : null;
}
