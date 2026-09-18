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
export function unitFurniture(unit: number): FurnitureFace[] {
  const x0 = unit * UNIT_PITCH_X;
  const faces: FurnitureFace[] = [];
  const box = (
    kinds: [FurnitureFace['kind'], FurnitureFace['kind'], FurnitureFace['kind']],
    x: number,
    w: number,
    y: number,
    d: number,
    z: number,
    h: number,
  ) => {
    faces.push(face(kinds[0], z + h, [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]]));
    faces.push(face(kinds[1], z + h, [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]]));
    faces.push(face(kinds[2], z + h, [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]]));
  };
  const bottom = -SHELF_THICKNESS;
  box(['upright-top', 'upright-end', 'upright-front'], x0 - UPRIGHT.thickness, UPRIGHT.thickness, 0, UPRIGHT.depth, bottom, UPRIGHT.height);
  for (let row = 0; row < SHELVES_PER_UNIT; row += 1) {
    const z = rowZ(row);
    box(['shelf-top', 'shelf-end', 'shelf-front'], x0 - UPRIGHT.thickness, SHELF_LENGTH + UPRIGHT.thickness, 0, SHELF_DEPTH, z - SHELF_THICKNESS, SHELF_THICKNESS);
  }
  /* Inside the shelf's end, as drawn: the +x face at 350, the front at 340…350. */
  box(['upright-top', 'upright-end', 'upright-front'], x0 + SHELF_LENGTH - UPRIGHT.thickness, UPRIGHT.thickness, 0, UPRIGHT.depth, bottom, UPRIGHT.height);
  return faces;
}

/** Where seat `i` of a row sits in x, within its unit. */
export function seatX(unit: number, index: number): number {
  return unit * UNIT_PITCH_X + SHELF_INSET_X + index * SEAT_PITCH;
}

export type UnitRow = { unit: number; row: number; seats: ShelfSeat[] };

export function unitRows(seats: readonly ShelfSeat[]): UnitRow[] {
  return intoUnits(seats).flatMap((rows, unit) => rows.map((row, index) => ({ unit, row: index, seats: row })));
}
