import { DEPTH, SPINE_HEIGHT, type PlacedSeat, type RecordBox } from './geometry';

/**
 * The painter's order, by separating plane (8a §11.20, and the probe's
 * finding). **Order the drawing's objects — not faces — by separating
 * plane, and fall back to centroid depth only when no plane separates
 * them.** Two disjoint boxes always have a consistent order; for
 * axis-aligned boxes a plane on x, y or z gives it exactly, with the larger
 * side nearer on every axis — the camera is at +(1, 1, 1), the one
 * direction P(x, y, z) collapses. Centroid depth is invalid on its own: the
 * pulled record's cover spans a long run in y, so its centroid sits behind
 * neighbours it is in front of.
 *
 * **The comparator takes bounds.** Every seated record is separated from
 * its neighbours on x, so the seated row is exactly ordered by x alone; a
 * moving record joins that order by its own bounds, which expand as it
 * grows and rotates. §11.18: at y ≥ 150 a plane on y separates it from the
 * whole row and it draws in front of every seat regardless of x; before
 * that a neighbour at larger x is genuinely nearer and draws over it.
 *
 * Rows keep §11.8's document order — top to bottom, the order a keyboard
 * walks — because rows never overlap on screen at rest. A moving record is
 * placed within its own row by the plane rule, and after every row once it
 * is nearer than every seat. The one case the two rules disagree on is a
 * grown record still inside the row's y-band overlapping a lower row on
 * screen; there the document order wins, and it is recorded in NOTES.
 */
export const NEARER = { x: 1, y: 1, z: 1 } as const;

export type PaintBounds = {
  id: string;
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  z0: number;
  z1: number;
  /** The shelf row the object belongs to, 0 at the top. Seated objects carry theirs; a moving one the row it came from. */
  row?: number;
  moving?: boolean;
};

/** A seated record's bounds: its box, DEPTH deep and SPINE_HEIGHT tall. */
export function seatBounds(seat: PlacedSeat, row?: number): PaintBounds {
  return { id: seat.id, x0: seat.x, x1: seat.x + seat.width, y0: seat.y, y1: seat.y + DEPTH, z0: seat.z, z1: seat.z + SPINE_HEIGHT, row };
}

/** A box's bounds — a grown record still axis-aligned. */
export function boxBounds(box: RecordBox, row?: number): PaintBounds {
  return { id: box.id, x0: box.x, x1: box.x + box.width, y0: box.y, y1: box.y + box.depth, z0: box.z, z1: box.z + box.height, row, moving: true };
}

/**
 * Positive when `a` is nearer the camera than `b`. A separating plane on
 * any axis decides — the larger side is nearer — and only when none
 * separates does the centroid along (1, 1, 1) decide. When two planes
 * separate the same pair with opposite verdicts, neither object can occlude
 * the other (a ray toward the camera leaves one range before it enters the
 * other), so the order is a convention: y is checked first, which is
 * §11.18's — past the row on y, the record draws in front of every seat
 * regardless of x.
 */
export function nearer(a: PaintBounds, b: PaintBounds): number {
  const eps = 1e-9;
  for (const axis of ['y', 'x', 'z'] as const) {
    const [a0, a1, b0, b1] = [a[`${axis}0`], a[`${axis}1`], b[`${axis}0`], b[`${axis}1`]];
    if (a0 >= b1 - eps) return NEARER[axis];
    if (b0 >= a1 - eps) return -NEARER[axis];
  }
  const depth = (o: PaintBounds) => (o.x0 + o.x1) / 2 + (o.y0 + o.y1) / 2 + (o.z0 + o.z1) / 2;
  return depth(a) - depth(b);
}

export function paintSort(objects: readonly PaintBounds[]): PaintBounds[] {
  const seated = objects.filter((o) => !o.moving);
  const moving = objects.filter((o) => o.moving);
  /* Rows top to bottom (larger z first), then along the row: exactly the x order, since seats are x-separated. */
  const rowOf = (o: PaintBounds) => o.row ?? -o.z1;
  const order = [...seated].sort((a, b) => rowOf(a) - rowOf(b) || a.x0 - b.x0);
  for (const m of moving) {
    if (order.every((s) => nearer(m, s) > 0)) {
      order.push(m);
      continue;
    }
    /* Within its own row: after the last seat it is nearer than, before the first that is nearer than it. */
    const row = order.filter((s) => !s.moving && rowOf(s) === rowOf(m));
    const nearerSeat = row.find((s) => nearer(s, m) > 0);
    const at = nearerSeat === undefined ? (row.length > 0 ? order.indexOf(row[row.length - 1]) + 1 : order.length) : order.indexOf(nearerSeat);
    order.splice(at, 0, m);
  }
  return order;
}
