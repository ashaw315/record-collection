import { frontFace, layoutRow, rightFace, rowBreaks, topFace, type PlacedSeat, type Point } from './geometry';
import { perShelf, unitPieces, unitRows, type FurnitureFace, type UnitPiece } from './unit';
import type { ShelfSeat } from './shelf-runs';
import { wallFrame, widened } from './wall-frame';

/**
 * The wall's layout, computed once for whoever draws against it — the
 * renderers, and the stage that places the pull. Two callers deriving the
 * same placement separately is the two-producers shape this project keeps
 * finding.
 *
 * §11.10 / §11.23: the collection fills one fixture left to right, top to
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
  void moving;
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
  /* Framed on the furniture and the faces, at least as large as the region that shows it. */
  const frame = widened(
    wallFrame(
      furniture.map((face) => face.points),
      placed.flatMap((seat) => [frontFace(seat), topFace(seat), rightFace(seat)]),
    ),
    minWidth,
    minHeight,
  );
  return { placed, furniture, pieces, breaks, frame };
}
