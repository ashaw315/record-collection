import { frontFace, layoutRow, rightFace, rowBreaks, topFace, type PlacedSeat, type Point } from './geometry';
import { unitFurniture, unitRows, type FurnitureFace } from './unit';
import type { ShelfSeat } from './shelf-runs';
import { wallFrame, widened } from './wall-frame';

/**
 * The wall's layout, computed once for whoever draws against it — the
 * renderers, and the stage that places the pull. Two callers deriving the
 * same placement separately is the two-producers shape this project keeps
 * finding.
 *
 * §11.10: the collection fills fixed units left to right, top to bottom;
 * the furniture is the unit's — four shelves joined by uprights — drawn
 * before the records, as §11.11 draws it. The pan extent holds the units.
 */
export type WallLayout = {
  placed: PlacedSeat[];
  furniture: FurnitureFace[];
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
  const furniture: FurnitureFace[] = [];
  const rows = unitRows(seats);
  const unitCount = Math.max(1, ...rows.map((r) => r.unit + 1));
  for (let unit = 0; unit < unitCount; unit += 1) furniture.push(...unitFurniture(unit));
  for (const { unit, row, seats: rowSeats } of rows) {
    const rowPlaced = layoutRow(rowSeats, row, unit);
    breaks.push(...rowBreaks(rowSeats, rowPlaced));
    placed.push(...rowPlaced);
  }
  /* Framed on the furniture and the faces, at least as large as the region that shows it. */
  const frame = widened(
    wallFrame(
      furniture.map((face) => face.points),
      placed.flatMap((seat) => [frontFace(seat), topFace(seat), rightFace(seat)]),
    ),
    minWidth,
    minHeight,
  );
  return { placed, furniture, breaks, frame };
}
