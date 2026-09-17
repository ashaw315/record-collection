import { shelfRuns, type ShelfSeat } from './shelf-runs';

/**
 * The geometry both wall components share (The Wall D2, on 5b's constants).
 *
 * **One projection, and nothing individually sheared.** `project(x, y, z)`
 * maps length, depth and height into the plane — the reference's mapping, x
 * down-right, y down-left, z straight up — and every face the wall draws is
 * three coordinates seen once through it. Seats advance along x, so the row
 * lies on the axis; the shelf is a plane at its row's z; faces paint back to
 * front by x + y across the whole wall.
 *
 * That replaces a build that advanced seats along screen x and sheared each
 * spine on its own — a flat row with 5b's climb sitting in the pitch as dead
 * space, and a shelf that peeled from spines because it alone was on the
 * axis. The repair for the peel (c5ce6ab) flattened the shelf to match, and
 * its test asserted the flattening; both went with this rewrite.
 *
 * Pure, and testable without rendering anything.
 */

/** 30°, the isometric basis. Shared with the record screen's construction. */
export const COS30 = Math.cos(Math.PI / 6);
export const SIN30 = 0.5;

/**
 * **The wall's constant, and everything else derives from it.** 5b's 240 is
 * where the 9px floor's argument is made — a label's band across the spine
 * fits the thinnest record at this height and not at 120 — so it stays, and
 * D2's figures (drawn at H = 150, the reference's units) apply as ratios.
 */
export const SPINE_HEIGHT = 240;
const D2 = SPINE_HEIGHT / 150;

/** §1: the real thickness bounds, derived so they follow SPINE_HEIGHT. */
export const SPINE_WIDTH_MIN = Math.round(SPINE_HEIGHT / 14);
export const SPINE_WIDTH_MAX = Math.round(SPINE_HEIGHT / 10);

/**
 * **Depth is square: a record is as deep as it is tall.** D2 retires 5b's 52,
 * which drew a card on edge, and makes DEPTH the RECORD's dimension — the
 * shelf's follows from it. But depth was not what made the first D2 read as
 * one slab; thickness was, which is why GAP exists as its own ruling.
 */
export const DEPTH = SPINE_HEIGHT;

/**
 * The gap between records. **Thickness plus gap is what keeps the objects
 * countable**: at 22 thick with no gap the top faces tile into a continuous
 * ramp; at 12 with a 5 gap each record separates. So seats advance by their
 * own width plus this, rather than all sitting at the widest.
 */
export const GAP = Math.round(5 * D2);

/** The plane's margins around its records: along the row, and behind them. */
export const SHELF_INSET_X = Math.round(20 * D2);
export const SHELF_INSET_Y = Math.round(10 * D2);

/** The plane in front of the records, and how far a pulled record slides — equal, so it lands on the front edge. */
export const LEDGE = Math.round(46 * D2);
export const SLIDE = LEDGE;

/**
 * One row to the next, down z. A row's silhouette is H + D·sin30, and the
 * ledge sits under it; at D2's 238 the lower row's top faces ate the upper
 * row's ledge, at 286 they clear it. Asserted as an inequality in the tests,
 * so the figure can move but not below the silhouette.
 */
export const ROW_PITCH = Math.round(286 * D2);

/** A point on the page. */
export type Point = readonly [number, number];

/** The reference's projection: x down-right, y down-left, z up. */
export function project(x: number, y: number, z: number): Point {
  return [(x - y) * COS30, (x + y) * SIN30 - z];
}

/**
 * How thick a given record's spine is.
 *
 * **One record, one width, from both components — and the hash takes the id
 * and nothing else** (8a §11). Spread across the real 17–24 bounds by a
 * stable hash, invented within real bounds exactly as the drawing did; when
 * the real field lands, this is the one place it goes.
 */
export function spineWidth(recordId: string): number {
  let hash = 0;
  for (let index = 0; index < recordId.length; index += 1) {
    hash = (hash * 31 + recordId.charCodeAt(index)) % 100_000;
  }

  const span = SPINE_WIDTH_MAX - SPINE_WIDTH_MIN;
  return SPINE_WIDTH_MIN + (hash % (span + 1));
}

/** A record placed in wall space: its near-left-bottom corner and thickness. */
export type PlacedSeat = {
  id: string;
  x: number;
  y: number;
  z: number;
  width: number;
};

/**
 * One row's seats, placed. Row 0 is the highest; each row is ROW_PITCH lower.
 * The pulled record sits SLIDE forward along y — the drawing's rest position
 * for a pulled record; the animated slide interpolates to it (pull-geometry).
 */
export function layoutRow(
  seats: readonly ShelfSeat[],
  row: number,
  pulledId: string | null,
  slide: number = SLIDE,
): PlacedSeat[] {
  const z = -row * ROW_PITCH;
  let x = SHELF_INSET_X;
  return seats.map((seat) => {
    const width = spineWidth(seat.id);
    const placed = {
      id: seat.id,
      x,
      y: SHELF_INSET_Y + (seat.id === pulledId ? slide : 0),
      z,
      width,
    };
    x += width + GAP;
    return placed;
  });
}

/** The spine: the record's near face, at y + DEPTH. */
export function frontFace({ x, y, z, width }: PlacedSeat): readonly Point[] {
  const near = y + DEPTH;
  return [
    project(x, near, z),
    project(x + width, near, z),
    project(x + width, near, z + SPINE_HEIGHT),
    project(x, near, z + SPINE_HEIGHT),
  ];
}

/**
 * The shelf under a run: **a single plane**, not a board. 5b rules out three
 * faces and the reason survives the reference — a shelf with three faces is a
 * box, and a box drawn around the collection competes with the records
 * standing in it. It spans the run's seats plus the inset either side, and
 * runs from behind the records to the ledge in front of them.
 *
 * Between runs the plane stops and restarts (5b §2): there is no shelf there.
 * Within a run it spans an emptied seat, because the shelf is still there and
 * the record is not on it.
 */
export function shelfPlane(run: readonly PlacedSeat[], z: number): readonly Point[] {
  const first = run[0];
  const last = run[run.length - 1];
  const x0 = first.x - SHELF_INSET_X;
  const x1 = last.x + last.width + SHELF_INSET_X;
  const near = SHELF_INSET_Y + DEPTH + LEDGE;
  return [project(x0, 0, z), project(x1, 0, z), project(x1, near, z), project(x0, near, z)];
}

/**
 * Painter's order: back to front by x + y, **across the whole wall.** Depth
 * from the camera does not involve z, so a record slid forward on one shelf
 * is nearer than everything at its x on every other shelf. Sorting per shelf
 * painted the pulled record under rows it stands in front of.
 */
export function paintOrder<T extends { x: number; y: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.x + a.y - (b.x + b.y));
}

/**
 * The label's plane: the front face, entered at its bottom-left corner, with
 * local x running up the spine and local y along the row. D2's matrix,
 * `matrix(0, −1, cos30, sin30, P)` — determinant +cos30, so the text is not
 * mirrored (the cover's plane is, which is why it carries no caption).
 */
export function labelTransform(seat: PlacedSeat): string {
  const [px, py] = project(seat.x, seat.y + DEPTH, seat.z);
  return `matrix(0 -1 ${COS30} ${SIN30} ${px} ${py})`;
}

/**
 * The planes a row draws: one per run, over the run's seats — the pulled
 * record's seat included, since a plane drawn from the seated records alone
 * would shrink when a record is pulled, the other absence drawn as a gap at
 * the end instead of the middle.
 */
export function rowPlanes(
  shelf: readonly ShelfSeat[],
  placed: readonly PlacedSeat[],
  pulledId: string | null,
): (readonly Point[])[] {
  const sectionOf = new Map(shelf.map((seat) => [seat.id, seat.section]));
  return shelfRuns(shelf, pulledId).flatMap((run) => {
    const extent = placed.filter(
      (seat) => run.ids.includes(seat.id) || (seat.id === pulledId && sectionOf.get(seat.id) === run.section),
    );
    return extent.length === 0 ? [] : [shelfPlane(extent, extent[0].z)];
  });
}

/**
 * **5b's top face: what makes a spine an object rather than a bar** (5b §4),
 * over the record's footprint at z + H. And the right face, which is where
 * the pulled record's cover shows (D2, §11.3). Both are the same three
 * coordinates the front face is, seen once.
 */
export function topFace({ x, y, z, width }: PlacedSeat): readonly Point[] {
  const top = z + SPINE_HEIGHT;
  return [
    project(x, y, top),
    project(x + width, y, top),
    project(x + width, y + DEPTH, top),
    project(x, y + DEPTH, top),
  ];
}

export function rightFace({ x, y, z, width }: PlacedSeat): readonly Point[] {
  const right = x + width;
  return [
    project(right, y, z),
    project(right, y + DEPTH, z),
    project(right, y + DEPTH, z + SPINE_HEIGHT),
    project(right, y, z + SPINE_HEIGHT),
  ];
}

/**
 * The cover's plane: a DEPTH × SPINE_HEIGHT rect mapped onto the right face
 * by D2's `matrix(−cos30, sin30, 0, 1, P)`, P the face's far-top corner.
 * The determinant is −cos30 — the plane is mirrored — so the pulled record
 * carries no caption: text on it would fight the geometry, and D2 removed
 * the caption rather than un-mirroring it.
 */
export function coverTransform({ x, y, z, width }: PlacedSeat): string {
  const [px, py] = project(x + width, y, z + SPINE_HEIGHT);
  return `matrix(${-COS30} ${SIN30} 0 1 ${px} ${py})`;
}
