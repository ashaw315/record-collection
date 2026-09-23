import { DEPTH, SPINE_HEIGHT, type PlacedSeat, type RecordBox } from './geometry';

/**
 * The painter's order, by separating plane (8a §W.20, and the probe's
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
 * grows and rotates. §W.18: at y ≥ 150 a plane on y separates it from the
 * whole row and it draws in front of every seat regardless of x; before
 * that a neighbour at larger x is genuinely nearer and draws over it.
 *
 * Every object goes through the same insertion (`paintOrder`) — the unit's
 * shelves and uprights included, since a shelf above a row is nearer than
 * that row's top faces and a right upright nearer than the row it ends.
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
  moving?: boolean;
};

/** A seated record's bounds: its box, DEPTH deep and SPINE_HEIGHT tall. */
export function seatBounds(seat: PlacedSeat): PaintBounds {
  return { id: seat.id, x0: seat.x, x1: seat.x + seat.width, y0: seat.y, y1: seat.y + DEPTH, z0: seat.z, z1: seat.z + SPINE_HEIGHT };
}

/** A box's bounds — a grown record still axis-aligned. */
export function boxBounds(box: RecordBox): PaintBounds {
  return { id: box.id, x0: box.x, x1: box.x + box.width, y0: box.y, y1: box.y + box.depth, z0: box.z, z1: box.z + box.height, moving: true };
}

/**
 * Positive when `a` is nearer the camera than `b`. A separating plane on
 * any axis decides — the larger side is nearer — and only when none
 * separates does the centroid along (1, 1, 1) decide. When two planes
 * separate the same pair with opposite verdicts, neither object can occlude
 * the other (a ray toward the camera leaves one range before it enters the
 * other), so the order is a convention: y is checked first, which is
 * §W.18's — past the row on y, the record draws in front of every seat
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

/**
 * The reference's insertion: every object — each shelf, each upright, each
 * record, the moving one — placed before the first object already placed
 * that it is farther than. Input order only decides ties no plane or
 * centroid separates. Across rows this puts the lower row FIRST, since the
 * upper row is nearer (a plane on z): at the square seat a record's
 * projected extent is 150 plus a 75px top face against a 198 pitch, so a
 * lower row's tops would overpaint the bottom 27px of the row above unless
 * the upper row paints later. Document order therefore follows the paint
 * order and is no longer seat order across rows — §W.8's assertion has
 * failed as it was designed to, and the reading order is with Design.
 */
export function paintOrder<T extends PaintBounds>(objects: readonly T[]): T[] {
  const out: T[] = [];
  for (const object of objects) {
    let at = out.length;
    for (let i = 0; i < out.length; i += 1) {
      if (nearer(object, out[i]) < 0) {
        at = i;
        break;
      }
    }
    out.splice(at, 0, object);
  }
  return out;
}
