import {
  ROW_PITCH,
  SEAT_PITCH,
  SHELF_DEPTH,
  SHELF_INSET_X,
  SHELF_LENGTH,
  SHELF_THICKNESS,
  UNIT_PITCH_X,
  UPRIGHT,
  project,
  type Point,
} from './geometry';
import type { ShelfSeat } from './shelf-runs';

/**
 * The unit (8a §11.10, figures from §11.11): **a fixed unit of four shelves
 * joined at their ends, and the collection fills it left to right, top to
 * bottom.** Capacity per row could not make a shelf read as a shelf — that is
 * the shape of the stack, a different axis — so the row length comes from
 * the unit's proportion, taller than wide, and the collection is what varies.
 * Empty shelves draw: at seventeen records three empty shelves are the
 * fixture rather than a gap in it. Above one unit's worth the wall gains
 * units, and the pan extent is what holds them; no row ever lengthens.
 *
 * Joined at their ends and nowhere else: the four planes plus the vertical
 * members at their ends. No back, no front, no top — a box around the
 * collection competes with the records standing in it (5b), and four planes
 * with nothing joining them is not a shelf either.
 */
export const PER_SHELF = 20;
export const SHELVES_PER_UNIT = 4;
export const PER_UNIT = PER_SHELF * SHELVES_PER_UNIT;

/** Seats into units of four rows of twenty, top row first; empty rows kept, since they draw. */
export function intoUnits<T>(seats: readonly T[]): T[][][] {
  const units: T[][][] = [];
  const count = Math.max(1, Math.ceil(seats.length / PER_UNIT));
  for (let u = 0; u < count; u += 1) {
    const rows: T[][] = [];
    for (let r = 0; r < SHELVES_PER_UNIT; r += 1) {
      const start = u * PER_UNIT + r * PER_SHELF;
      rows.push(seats.slice(start, start + PER_SHELF));
    }
    units.push(rows);
  }
  return units;
}

export function unitOf(seatIndex: number): number {
  return Math.floor(seatIndex / PER_UNIT);
}

/** A row's shelf-top height: row 0 is the top shelf. */
export function rowZ(row: number): number {
  return (SHELVES_PER_UNIT - 1 - row) * ROW_PITCH;
}

export type FurnitureFace = {
  kind: 'shelf-top' | 'shelf-front' | 'shelf-end' | 'upright-top' | 'upright-front' | 'upright-end';
  z: number;
  points: readonly Point[];
};

const face = (kind: FurnitureFace['kind'], z: number, corners: ReadonlyArray<readonly [number, number, number]>): FurnitureFace => ({
  kind,
  z,
  points: corners.map(([x, y, zz]) => project(x, y, zz)),
});

/**
 * One unit's furniture as drawn in §11.11: two uprights and four shelves,
 * three visible faces each — top, the +x end, the near front, which is the
 * +y face (§11.20: the camera is at +(1, 1, 1)). Drawn before the records;
 * the tops and ends are among the drawing's own polygons (unit.test.ts) —
 * its strips were drawn on the −y side and are superseded.
 */
export type UnitPiece = {
  id: string;
  kind: 'shelf' | 'upright';
  /** For a shelf, its row (0 at the top). */
  row?: number;
  bounds: { x0: number; x1: number; y0: number; y1: number; z0: number; z1: number };
  faces: FurnitureFace[];
};

/**
 * The unit as objects for the painter (§11.20): two uprights and four
 * shelves, each with its bounds and its three faces. A shelf paints before
 * the records standing on it and after the row below it; the right upright
 * after the row it ends.
 */
export function unitPieces(unit: number): UnitPiece[] {
  const x0 = unit * UNIT_PITCH_X;
  const piece = (
    id: string,
    kind: UnitPiece['kind'],
    kinds: [FurnitureFace['kind'], FurnitureFace['kind'], FurnitureFace['kind']],
    x: number,
    w: number,
    y: number,
    d: number,
    z: number,
    h: number,
    row?: number,
    sortBounds?: UnitPiece['bounds'],
  ): UnitPiece => ({
    id,
    kind,
    row,
    bounds: sortBounds ?? { x0: x, x1: x + w, y0: y, y1: y + d, z0: z, z1: z + h },
    faces: [
      face(kinds[0], z + h, [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]),
      face(kinds[1], z + h, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]),
      face(kinds[2], z + h, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]),
    ],
  });
  const bottom = -SHELF_THICKNESS;
  const pieces: UnitPiece[] = [];
  pieces.push(piece(`unit${unit}-upright-left`, 'upright', ['upright-top', 'upright-end', 'upright-front'], x0 - UPRIGHT.thickness, UPRIGHT.thickness, 0, UPRIGHT.depth, bottom, UPRIGHT.height));
  for (let row = 0; row < SHELVES_PER_UNIT; row += 1) {
    const z = rowZ(row);
    /*
      Drawn from upright to upright, as §11.11 draws it — but SORTED as the
      span between them. A shelf's drawn box interpenetrates the uprights at
      its ends, and interpenetrating boxes have no separating plane: the
      centroid fallback then put the right upright nearer than the top shelf
      while the records were nearer than the upright and the shelf nearer
      than the records — a cycle the insertion resolved by painting the top
      shelf over its own row's spines, and no spine could be clicked. Between
      the uprights every pair has a plane.
    */
    pieces.push(
      piece(`unit${unit}-shelf-${row}`, 'shelf', ['shelf-top', 'shelf-end', 'shelf-front'], x0 - UPRIGHT.thickness, SHELF_LENGTH + UPRIGHT.thickness, 0, SHELF_DEPTH, z - SHELF_THICKNESS, SHELF_THICKNESS, row, {
        x0,
        x1: x0 + SHELF_LENGTH - UPRIGHT.thickness,
        y0: 0,
        y1: SHELF_DEPTH,
        z0: z - SHELF_THICKNESS,
        z1: z,
      }),
    );
  }
  /* Inside the shelf's end, as drawn: the +x face at 350, the front at 340…350. */
  pieces.push(piece(`unit${unit}-upright-right`, 'upright', ['upright-top', 'upright-end', 'upright-front'], x0 + SHELF_LENGTH - UPRIGHT.thickness, UPRIGHT.thickness, 0, UPRIGHT.depth, bottom, UPRIGHT.height));
  return pieces;
}

/** The unit's faces in piece order — the frame's and the tests' view of the furniture. */
export function unitFurniture(unit: number): FurnitureFace[] {
  return unitPieces(unit).flatMap((piece) => piece.faces);
}

/** Where seat `i` of a row sits in x, within its unit. */
export function seatX(unit: number, index: number): number {
  return unit * UNIT_PITCH_X + SHELF_INSET_X + index * SEAT_PITCH;
}

export type UnitRow = { unit: number; row: number; seats: ShelfSeat[] };

export function unitRows(seats: readonly ShelfSeat[]): UnitRow[] {
  return intoUnits(seats).flatMap((rows, unit) => rows.map((row, index) => ({ unit, row: index, seats: row })));
}
