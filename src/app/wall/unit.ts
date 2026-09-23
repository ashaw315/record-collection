import {
  ROW_PITCH,
  SEAT_PITCH,
  SHELF_DEPTH,
  SHELF_INSET_X,
  SHELF_THICKNESS,
  UPRIGHT,
  project,
  type Point,
} from './geometry';
import type { ShelfSeat } from './shelf-runs';

/**
 * The unit (8a §W.10, figures from §W.11): **a fixed unit of four shelves
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
/** §W.11's unit: twenty a shelf, four shelves — the fixture at its smallest. */
export const PER_SHELF = 20;
export const SHELVES_PER_UNIT = 4;

/**
 * **One fixture; the row length grows with the collection (§W.23).** Tiling
 * is withdrawn: three units along +x read as three bookcases stepping away
 * from the reader, and they did not even touch — 600 of +x projects 520
 * right and 300 down, and each unit carried its own uprights. Row length
 * is a parameter (§W.15 named it so); where shelves go is a fact. Twenty a
 * shelf up to eighty records, then a quarter of the collection a shelf:
 * 200 is 50 × 4, 883 × 1302 on screen, one wall of records.
 */
export function perShelf(count: number): number {
  return Math.max(PER_SHELF, Math.ceil(count / SHELVES_PER_UNIT));
}

/** A shelf runs from the left upright's face to the right upright's far face: the seats, then the upright inside its end. */
export function shelfLength(seatsPerShelf: number): number {
  return seatsPerShelf * SEAT_PITCH + UPRIGHT.thickness;
}

/** Seats into four rows, top row first; empty rows kept, since they draw. */
export function intoRows<T>(seats: readonly T[]): T[][] {
  const per = perShelf(seats.length);
  const rows: T[][] = [];
  for (let r = 0; r < SHELVES_PER_UNIT; r += 1) rows.push(seats.slice(r * per, (r + 1) * per));
  return rows;
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
 * The fixture as objects for the painter (§W.20, §W.23): two uprights and
 * four shelves of `seatsPerShelf`, each with its bounds and its three faces
 * — top, the +x end, the near front (the +y face). At twenty a shelf the
 * tops and ends are §W.11's own polygons (unit.test.ts); its strips were
 * drawn on the −y side and are superseded.
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
 * The unit as objects for the painter (§W.20): two uprights and four
 * shelves, each with its bounds and its three faces. A shelf paints before
 * the records standing on it and after the row below it; the right upright
 * after the row it ends.
 */
export function unitPieces(seatsPerShelf: number): UnitPiece[] {
  const x0 = 0;
  const length = shelfLength(seatsPerShelf);
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
  pieces.push(piece(`upright-left`, 'upright', ['upright-top', 'upright-end', 'upright-front'], x0 - UPRIGHT.thickness, UPRIGHT.thickness, 0, UPRIGHT.depth, bottom, UPRIGHT.height));
  for (let row = 0; row < SHELVES_PER_UNIT; row += 1) {
    const z = rowZ(row);
    /*
      Drawn from upright to upright, as §W.11 draws it — but SORTED as the
      span between them. A shelf's drawn box interpenetrates the uprights at
      its ends, and interpenetrating boxes have no separating plane: the
      centroid fallback then put the right upright nearer than the top shelf
      while the records were nearer than the upright and the shelf nearer
      than the records — a cycle the insertion resolved by painting the top
      shelf over its own row's spines, and no spine could be clicked. Between
      the uprights every pair has a plane.
    */
    pieces.push(
      piece(`shelf-${row}`, 'shelf', ['shelf-top', 'shelf-end', 'shelf-front'], x0 - UPRIGHT.thickness, length + UPRIGHT.thickness, 0, SHELF_DEPTH, z - SHELF_THICKNESS, SHELF_THICKNESS, row, {
        x0,
        x1: x0 + length - UPRIGHT.thickness,
        y0: 0,
        y1: SHELF_DEPTH,
        z0: z - SHELF_THICKNESS,
        z1: z,
      }),
    );
  }
  /* Inside the shelf's end, as drawn: the +x face at 350, the front at 340…350. */
  pieces.push(piece(`upright-right`, 'upright', ['upright-top', 'upright-end', 'upright-front'], x0 + length - UPRIGHT.thickness, UPRIGHT.thickness, 0, UPRIGHT.depth, bottom, UPRIGHT.height));
  return pieces;
}

/** The fixture's faces in piece order — the frame's and the tests' view of the furniture. */
export function unitFurniture(seatsPerShelf: number): FurnitureFace[] {
  return unitPieces(seatsPerShelf).flatMap((piece) => piece.faces);
}

/** Where seat `i` of a row sits in x. */
export function seatX(index: number): number {
  return SHELF_INSET_X + index * SEAT_PITCH;
}

export type UnitRow = { row: number; seats: ShelfSeat[] };

export function unitRows(seats: readonly ShelfSeat[]): UnitRow[] {
  return intoRows(seats).map((row, index) => ({ row: index, seats: row }));
}
