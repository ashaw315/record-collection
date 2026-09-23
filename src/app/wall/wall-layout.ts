import { frontFace, layoutRow, rightFace, rowBreaks, topFace, type PlacedSeat, type Point } from './geometry';
import { perShelf, unitPieces, unitRows, type FurnitureFace, type UnitPiece } from './unit';
import type { ShelfSeat } from './shelf-runs';
import { unionFrame, wallFrame, widened } from './wall-frame';
import { framedViewExtent, landedExtent } from './pan';

/**
 * The wall's layout, computed once for whoever draws against it — the
 * renderers, and the stage that places the pull. Two callers deriving the
 * same placement separately is the two-producers shape this project keeps
 * finding.
 *
 * §W.10 / §W.23: the collection fills one fixture left to right, top to
 * bottom; the furniture is four shelves joined by uprights, their length
 * growing with the collection. The pan extent holds the fixture.
 */
export type WallLayout = {
  placed: PlacedSeat[];
  furniture: FurnitureFace[];
  /** The unit's shelves and uprights as objects for the painter, with the breaks that sit on each shelf. */
  pieces: (UnitPiece & { breaks: (readonly [Point, Point])[] })[];
  breaks: (readonly [Point, Point])[];
  frame: { viewBox: string; width: number; height: number };
};

export type Moving = { id: string };

export function wallLayout(
  seats: readonly ShelfSeat[],
  moving: readonly Moving[],
  minWidth: number,
  minHeight = 0,
): WallLayout {
  const placed: PlacedSeat[] = [];
  const breaks: (readonly [Point, Point])[] = [];
  const pieces: WallLayout['pieces'] = [];
  const rows = unitRows(seats);
  pieces.push(...unitPieces(perShelf(seats.length)).map((piece) => ({ ...piece, breaks: [] })));
  for (const { row, seats: rowSeats } of rows) {
    const rowPlaced = layoutRow(rowSeats, row);
    const rowBreakMarks = rowBreaks(rowSeats, rowPlaced);
    breaks.push(...rowBreakMarks);
    const shelf = pieces.find((piece) => piece.kind === 'shelf' && piece.row === row);
    if (shelf !== undefined) shelf.breaks.push(...rowBreakMarks);
    placed.push(...rowPlaced);
  }
  const furniture = pieces.flatMap((piece) => piece.faces);
  /*
    Framed on the furniture and the faces, at least as large as the region
    that shows it — and, while a record moves, on where it lands with its
    arrows (§W.22): the pan needs somewhere to pan to, and the plane runs
    the pan extent (§W.7).
  */
  const seatedFrame = widened(
    wallFrame(
      furniture.map((face) => face.points),
      placed.flatMap((seat) => [frontFace(seat), topFace(seat), rightFace(seat)]),
    ),
    minWidth,
    minHeight,
  );
  const landings = moving.flatMap((m) => {
    const seat = placed.find((p) => p.id === m.id);
    if (seat === undefined) return [];
    /* The whole view at the landing's framing, so the pan can always reach it; the landing's own extent when no region is known. */
    return [minWidth > 0 && minHeight > 0 ? framedViewExtent(seat, { width: minWidth, height: minHeight }) : landedExtent(seat)];
  });
  /* The union, not a refit: the seated frame keeps every pixel, and the landing is overflow the region scrolls to. */
  const frame = unionFrame(seatedFrame, landings);
  return { placed, furniture, pieces, breaks, frame };
}
