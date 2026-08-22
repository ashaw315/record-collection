import { SHELF_EDGE, SPINE_HEIGHT } from '../shelf/spine';

/**
 * Where every spine sits on the wall, computed rather than left to flexbox.
 *
 * **Flexbox is not doing this any more**, and that is the price of putting the
 * wall in the scene. A WebGL wall has no line boxes and no wrapping, so the
 * packing that CSS did implicitly becomes arithmetic here.
 *
 * That is a gain rather than a cost for testability. Unit 23 spent eight
 * attempts aligning a shelf to the feet of a wrapped row because the layout was
 * a repeating background whose origin nothing could measure — a background has
 * no box. Here the shelf's position is a number derived from the row's, and a
 * test can assert the relationship directly.
 *
 * **The rules themselves carry unchanged.** Spine widths come from the caller
 * (`spineWidth`, 17-24px at 1:12), the row rhythm is `SPINE_HEIGHT +
 * SHELF_EDGE`, and the ORDER is whatever the caller passed — §10b's genre
 * ordering with its tie-break, which is the requirement that outlived every
 * mechanism it has been implemented in.
 *
 * Coordinates are wall-space pixels: x from the left edge, y DOWN from the top,
 * matching the DOM's sense so the caller's measurements need no conversion.
 * The scene converts once, at the boundary.
 */

/** A record's spine, as the layout needs it: an identity and a width. */
export type WallSpine = { id: string; width: number };

/** Where one spine ended up. */
export type PlacedSpine = {
  id: string;
  /** Left edge, wall-space pixels. */
  x: number;
  /** Top edge, wall-space pixels, growing downward. */
  y: number;
  width: number;
  /** Which shelf it stands on, from 0. */
  row: number;
};

/** One shelf: a full-width surface at the foot of a row. */
export type Shelf = { row: number; x: number; y: number; width: number; height: number };

export type WallLayout = {
  placed: PlacedSpine[];
  shelves: Shelf[];
  /** Total height, so a scroll container knows how far the wall goes. */
  height: number;
  /** The gap between spines, exposed so the renderer cannot disagree about it. */
  gap: number;
};

/** The gap between adjacent spines. Matches the CSS wall's `gap-x-[3px]`. */
const SPINE_GAP = 3;

/**
 * Breathing room at the wall's left and right edges — **the wall's ends**.
 *
 * QA saw the leftmost spines cut mid-word ("rannigan", "orvid Murder") and the
 * same at the right: the wall bled off both edges. The old 16px was measured
 * against a canvas that is itself inset by the page's own padding, so the first
 * spine sat on the very first pixel of the scene.
 *
 * A real shelf has ends. This is wide enough to read as one rather than as a
 * wall that continues past the frame.
 */
export const WALL_EDGE_MARGIN = 40;

/*
  The wall is as tall as its contents — no minimum row count.

  A four-row floor once stood here ("a room has a size"): a filtered result kept
  the room's height and said "these are the ones that matched" with empty shelf
  below. Removed after judging it on both screens with real data — at 390px the
  empty rows stretched the canvas and pushed records to odd positions, and at
  1280 they were two empty shelves saying in furniture what a count says in
  words. A24d, which the floor had satisfied, is amended to the same effect: the
  heading states "N of M records" when a filter is active, and the wall is the
  size of what is on it.
*/

const WALL_PADDING = WALL_EDGE_MARGIN;

export function layoutWall({
  spines,
  viewportWidth,
  gap = SPINE_GAP,
  padding = WALL_PADDING,
}: {
  spines: WallSpine[];
  viewportWidth: number;
  gap?: number;
  padding?: number;
}): WallLayout {
  if (spines.length === 0) {
    return { placed: [], shelves: [], height: 0, gap };
  }

  const usable = viewportWidth - padding * 2;
  const placed: PlacedSpine[] = [];

  let row = 0;
  let cursor = padding;

  for (const spine of spines) {
    const wouldEnd = cursor + spine.width;
    const rowStart = cursor === padding;

    /*
      Wrap when this spine would overflow — unless the row is empty, in which
      case it goes on anyway. **That guard is what makes a narrow viewport
      terminate**: without it a spine wider than the row can never be placed and
      the loop never advances, which hangs the tab rather than looking wrong.
    */
    if (!rowStart && wouldEnd > padding + usable) {
      row += 1;
      cursor = padding;
    }

    placed.push({
      id: spine.id,
      x: cursor,
      y: row * (SPINE_HEIGHT + SHELF_EDGE),
      width: spine.width,
      row,
    });

    cursor += spine.width + gap;
  }

  /*
    As tall as its contents — one shelf per row the records actually fill, no
    floor. The four-row minimum was removed (A24d amended): on both screens the
    empty rows did not earn their place — at 390px they stretched the canvas, at
    1280 they said in furniture what the heading's count now says in words. The
    "most of the collection is hidden" signal lives in "N of M records", not in
    empty shelf.
  */
  const rowCount = row + 1;

  /*
    **One shelf per row, spanning the FULL width.** §10b: "the surface runs edge
    to edge and ends where the wall ends", not where the records do — including
    the partial last row, which is the case that distinguishes a plane from a
    container and the one every candidate width failed.
  */
  const shelves: Shelf[] = Array.from({ length: rowCount }, (_, index) => ({
    row: index,
    x: 0,
    y: index * (SPINE_HEIGHT + SHELF_EDGE) + SPINE_HEIGHT,
    width: viewportWidth,
    height: SHELF_EDGE,
  }));

  return {
    placed,
    shelves,
    height: rowCount * (SPINE_HEIGHT + SHELF_EDGE),
    gap,
  };
}
