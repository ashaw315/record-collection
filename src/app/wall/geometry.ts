import type { ShelfSeat } from './shelf-runs';

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
 * **The wall's constant — the drawing's own face (8a §11.11).** §11.6 built
 * D2's proportions at 5b's 240; §11.11 draws the near view at true 1:1 with
 * a 150-unit face and measures its labels there, so the wall's unit IS the
 * drawing's: no ratio between them. Everything below is read off §11.11's
 * polygons under the same projection — the unit's extent, 441.7 × 1047 at
 * 1 : 2.37, is measured over every face `unitFurniture` emits and never
 * re-declared by hand (unit.test.ts).
 */
export const SPINE_HEIGHT = 150;

/** §1: the real thickness bounds, derived so they follow SPINE_HEIGHT — and textured within a fixed seat. */
export const SPINE_WIDTH_MIN = Math.round(SPINE_HEIGHT / 14);
export const SPINE_WIDTH_MAX = Math.round(SPINE_HEIGHT / 10);

/**
 * **A 12″ sleeve is square, so depth equals height** (§11.11). A seat of
 * 12 × 100 × 150 — a sleeve deeper than it is tall by nothing in particular
 * — made the pulled record grow 3× in depth and 2× in height to reach a
 * square cover, and the growth read as a rule about covers rather than as
 * an error in the seat. The record is as deep as the shelf it stands on.
 */
export const DEPTH = SPINE_HEIGHT;
export const SHELF_DEPTH = DEPTH;
export const SHELF_THICKNESS = 8;

/**
 * The seat: a fixed pitch of 17 (a 12 spine and a 5 gap, as drawn), the
 * hashed width textured inside it. Twenty seats to a 350 shelf.
 */
export const GAP = 5;
export const SEAT_PITCH = 17;
export const SHELF_LENGTH = 350;
/** Seats start at the shelf's left end: twenty at 17 fill 0…340, the right upright takes 340…350. */
export const SHELF_INSET_X = 0;
export const SHELF_INSET_Y = 0;
/** The unit's uprights: 10 thick, the shelf's depth, four pitches tall. */
export const ROW_PITCH = 198;
export const UPRIGHT = { thickness: 10, depth: SHELF_DEPTH, height: 4 * ROW_PITCH } as const;
/** Units along x, at the drawing's spacing (520 on screen). */
export const UNIT_PITCH_X = 600;
/** No ledge: the shelf is the record's depth. Kept as a name so nothing derives from a literal zero. */
export const LEDGE = 0;

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
 * A record as a box: a seat with its own depth and height. Seated, every
 * record is DEPTH × SPINE_HEIGHT and the faces below read those defaults;
 * pulled, it grows (§11.10) and stays a box under the same projection — the
 * faces are the same three coordinates seen once, whatever its size.
 */
export type RecordBox = PlacedSeat & { depth: number; height: number };
type BoxLike = PlacedSeat & Partial<Pick<RecordBox, 'depth' | 'height'>>;

/**
 * One row's seats, placed in their unit. Row 0 is the unit's top shelf;
 * seats advance at the fixed pitch, the record's hashed width inside each.
 * A pulled record keeps its seat empty: the pull moves it (§11.10).
 */
export function layoutRow(seats: readonly ShelfSeat[], row: number, unit = 0): PlacedSeat[] {
  const z = (3 - row) * ROW_PITCH;
  return seats.map((seat, index) => ({
    id: seat.id,
    x: unit * UNIT_PITCH_X + SHELF_INSET_X + index * SEAT_PITCH,
    y: SHELF_INSET_Y,
    z,
    width: spineWidth(seat.id),
  }));
}

/**
 * **Which side the reader is on (§11.15).** P(x, y, z) makes the visible
 * faces the ones with normals +x, −y and +z: the camera is at (+∞, −∞, +∞),
 * so a SMALLER y is nearer. The spine is the −y face — at the seat's own y —
 * and the cover is the +x face. D2 had the labelled face at y + D, which is
 * the back of every record; an extent test could not see it, since a
 * mirror in y leaves the bounding box alone (geometry.test.ts asserts the
 * convention at one place). `depth` is accepted so a grown box shares the
 * signature; the spine does not move with it.
 */
export function frontFace({ x, y, z, width, height = SPINE_HEIGHT }: BoxLike): readonly Point[] {
  const near = y;
  return [
    project(x, near, z),
    project(x + width, near, z),
    project(x + width, near, z + height),
    project(x, near, z + height),
  ];
}

/**
 * Painter's order — and document order, and seat order, which §11.8 says
 * must agree rather than be assumed to. SVG has no z-index, so paint order
 * is document order, and document order is what a keyboard walks.
 *
 * **Row-major, then back to front by x − y within the row.** Nearer is
 * larger x and smaller y (§11.15: the camera is at −y), so the painter's
 * key is x − y ascending. A global depth sort is blind to z: the second
 * row's left seats sorted between the first row's, so the drawing was never
 * rows-top-to-bottom and the keyboard would have walked it interleaved —
 * the test Design asked for caught it. Rows do not overlap at ROW_PITCH
 * (asserted), so row order costs the painter nothing; within a row seats
 * vary along x alone, so x − y IS seat order. A pulled record slides toward
 * the reader and must paint after the neighbours its faces cover, which is
 * why it is drawn as its own element and not as a seat: the seated anchors
 * keep seat order whatever is pulled.
 */
export function paintOrder<T extends { x: number; y: number; z: number }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => (a.z !== b.z ? b.z - a.z : a.x - a.y - (b.x - b.y)));
}

/**
 * The label's plane: the front face (the −y face), entered at its
 * bottom-left corner, with local x running up the spine and local y along
 * the row. D2's matrix,
 * `matrix(0, −1, cos30, sin30, P)` — determinant +cos30, so the text is not
 * mirrored (the cover's plane is, which is why it carries no caption).
 */
export function labelTransform(seat: BoxLike): string {
  const [px, py] = project(seat.x, seat.y, seat.z);
  return `matrix(0 -1 ${COS30} ${SIN30} ${px} ${py})`;
}

/**
 * **§2's section breaks are marks within the shelf, not its ends** (§11.7).
 * A break is a rule across the shelf's top at the seat boundary, from its far
 * edge to its near edge, and the shelf runs on past it. The pulled record's
 * seat is still a seat, so its boundary still carries one.
 */
export function rowBreaks(
  shelf: readonly ShelfSeat[],
  placed: readonly PlacedSeat[],
): (readonly [Point, Point])[] {
  const near = SHELF_DEPTH;
  const byId = new Map(placed.map((seat) => [seat.id, seat]));
  const breaks: (readonly [Point, Point])[] = [];
  for (let index = 1; index < shelf.length; index += 1) {
    if (shelf[index].section === shelf[index - 1].section) continue;
    const a = byId.get(shelf[index - 1].id);
    const b = byId.get(shelf[index].id);
    if (a === undefined || b === undefined) continue;
    const x = (a.x + a.width + b.x) / 2;
    breaks.push([project(x, 0, a.z), project(x, near, a.z)]);
  }
  return breaks;
}

/**
 * **5b's top face: what makes a spine an object rather than a bar** (5b §4),
 * over the record's footprint at z + H. And the right face, which is where
 * the pulled record's cover shows (D2, §11.3). Both are the same three
 * coordinates the front face is, seen once.
 */
export function topFace({ x, y, z, width, depth = DEPTH, height = SPINE_HEIGHT }: BoxLike): readonly Point[] {
  const top = z + height;
  return [
    project(x, y, top),
    project(x + width, y, top),
    project(x + width, y + depth, top),
    project(x, y + depth, top),
  ];
}

export function rightFace({ x, y, z, width, depth = DEPTH, height = SPINE_HEIGHT }: BoxLike): readonly Point[] {
  const right = x + width;
  return [
    project(right, y, z),
    project(right, y + depth, z),
    project(right, y + depth, z + height),
    project(right, y, z + height),
  ];
}

/**
 * The cover's plane: a depth × height rect mapped onto the right face,
 * **entered from its far-top corner (y + depth) with local x running toward
 * the reader, so the plane is not mirrored.** Seen from +x the in-plane
 * right-hand direction is −y (§11.15); D2's `matrix(−cos30, sin30, 0, 1, …)`
 * ran the other way and had determinant −cos30, which is why D2 removed its
 * caption rather than un-mirroring it. §11.7 puts type on this face for the
 * record with no cover, and a sleeve's own lettering reads backwards on a
 * mirrored plane — so: `matrix(cos30, −sin30, 0, 1, far-top)`, determinant
 * +cos30, which is §11.11's own image matrix.
 *
 * The plane's units are the wall's, at any size: a pulled record's cover
 * grows because its box does (§11.10), not because the plane is scaled — so
 * the shear stays the wall's angle by construction rather than by assertion.
 */
export function coverTransform({ x, y, z, width, depth = DEPTH, height = SPINE_HEIGHT }: BoxLike): string {
  const [px, py] = project(x + width, y + depth, z + height);
  return `matrix(${COS30} ${-SIN30} 0 1 ${px} ${py})`;
}

/**
 * **D1: the wall renders at 1:1 and pans.** A sub-1:1 wall is a shelf of
 * anonymous outlines once the label is the only identifying channel, so 5b
 * §5's remove-don't-shrink is a GUARD for a viewport narrower than one record
 * rather than the mechanism for showing the collection. One record is its
 * three faces' projected width — the footprint seen from the corner.
 */
export function oneRecordPx(): number {
  return (SPINE_WIDTH_MAX + DEPTH) * COS30;
}

export function labelsFit(containerPx: number): boolean {
  return containerPx >= oneRecordPx();
}
