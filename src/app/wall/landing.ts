import {
  COS30,
  DEPTH,
  SHELF_DEPTH,
  SHELF_INSET_Y,
  SIN30,
  SPINE_HEIGHT,
  project,
  spineWidth,
  type PlacedSeat,
  type RecordBox,
} from './geometry';
import { pullEase } from './pull-curve';

/**
 * Where the pull lands (8a §11.10): **the pulled record stays in the
 * projection.** It slides forward along the depth axis and grows, and it
 * does not straighten — the cover arrives as a parallelogram at the wall's
 * own angle, large, unmistakably the cover, and still part of the same
 * drawing. §11.9's straightening is withdrawn: a face resolving to zero shear
 * is a face meeting the reader, and it landed as an axis-aligned square with
 * no relationship to the drawing beneath it.
 *
 * **So the landing is a box, not a matrix.** The landed record is a
 * `RecordBox` — its own width, one square face's depth and height — and the
 * same `rightFace()` that draws every seated face draws its cover. The shear
 * equals the wall's angle because there is no other way to draw a box under
 * `project()`; a landing that drifted toward flat could not be expressed.
 *
 * The face is square because covers are: §11.11 draws the landed record at
 * 12 × 300 × 300 from a 12 × 100 × 150 seat, so the growth is not uniform —
 * depth ×3, height ×2 — and the sleeve changes proportion across the pull.
 * The size is the region's rather than the drawing's 300: the largest square
 * face the visible region holds, inset by the page's padding and the arrow
 * lanes (§11.9's "takes the region entire" survives).
 */

/** The page's padding, between the region's edge and the landed box. */
export const LANDING_PAD = 34;
/** Room beside the box for an arrow (44) and a gap — the arrows go with the record. */
export const ARROW_LANE = 56;

/** The visible drawing region, in the svg's own px, relative to its top-left. */
export type View = { x: number; y: number; width: number; height: number };
/** A box's extent on the page. */
export type Bounds = { minX: number; maxX: number; minY: number; maxY: number };

export function parseMatrix(transform: string): number[] {
  const inner = /matrix\(([^)]+)\)/.exec(transform)?.[1] ?? '';
  return inner.split(/[\s,]+/).filter((t) => t !== '').map(Number);
}

/** The projected extent of a box: its eight corners through the one projection. */
export function projectedBox(box: RecordBox): Bounds {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const x of [box.x, box.x + box.width]) {
    for (const y of [box.y, box.y + box.depth]) {
      for (const z of [box.z, box.z + box.height]) {
        const [px, py] = project(x, y, z);
        xs.push(px);
        ys.push(py);
      }
    }
  }
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) };
}

/**
 * The largest square face the region holds, for a record `width` thick. A
 * W × S × S box projects (S + W)·cos30 wide and S + (S + W)·sin30 tall.
 */
export function landingSize(view: View, width: number): number {
  const byHeight = (view.height - 2 * LANDING_PAD - width * SIN30) / (1 + SIN30);
  const byWidth = (view.width - 2 * (LANDING_PAD + ARROW_LANE)) / COS30 - width;
  return Math.max(0, Math.min(byHeight, byWidth));
}

/**
 * The landed box: the record's own width (the hash of its id, as every seat
 * is), one shelf's depth in front of the row — toward the reader, at −y —
 * its projected extent centred
 * in the region. Constructed, not approached — the end of the pull is this
 * box exactly.
 */
export function landedBox(id: string, view: View): RecordBox {
  const width = spineWidth(id);
  const size = landingSize(view, width);
  /* Forward is toward the reader, which is −y (§11.15). */
  const y = SHELF_INSET_Y - SHELF_DEPTH;
  const at = projectedBox({ id, x: 0, y, z: 0, width, depth: size, height: size });
  /* Along x the page moves cos30 across and sin30 down per unit; along z, straight up. */
  const dx = (view.x + view.width / 2 - (at.minX + at.maxX) / 2) / COS30;
  const dz = dx * SIN30 - (view.y + view.height / 2 - (at.minY + at.maxY) / 2);
  return { id, x: dx, y, z: dz, width, depth: size, height: size };
}

/** The seat as a box: DEPTH × SPINE_HEIGHT, where it stands. */
export function seatBox(seat: PlacedSeat): RecordBox {
  return { ...seat, depth: DEPTH, height: SPINE_HEIGHT };
}

/**
 * The box `eased` of the way from its seat to the landing: every dimension
 * on §11.2's one curve — translation, growth and depth together — and the
 * two ends exactly the seat's box and the landed one.
 */
export function landingBoxAt(seat: PlacedSeat, view: View, eased: number): RecordBox {
  const from = seatBox(seat);
  if (eased <= 0) return from;
  const to = landedBox(seat.id, view);
  if (eased >= 1) return to;
  const mix = (a: number, b: number) => a + (b - a) * eased;
  return {
    id: seat.id,
    x: mix(from.x, to.x),
    y: mix(from.y, to.y),
    z: mix(from.z, to.z),
    width: from.width,
    depth: mix(from.depth, to.depth),
    height: mix(from.height, to.height),
  };
}

/** The same, at `progress` of the pull on its curve. */
export function landingBox(seat: PlacedSeat, view: View, progress: number): RecordBox {
  return landingBoxAt(seat, view, pullEase(progress));
}

/**
 * §11.19's landed composition: **560 × 560, offset right, vertically
 * centred in the region — and neither number is the largest square that
 * fits.** A centred 779 covered the fixture entirely, which is total
 * occlusion rather than the overlap §11.18 ruled. The horizontal offset is
 * derived — travelling −y projects to +x on screen, so the gesture leaves
 * the record right of the fixture; the vertical placement is not — a fixed
 * 560 in an 847 region cannot track seats spread over four shelves, so it
 * is centred, for a reason rather than by default. The size is bounded by
 * what must stay visible: 264 of the unit's 324px clear, the empty seat
 * 55px clear of the cover's left edge.
 */
export const LANDED_SIZE = 560;
/** The page's gutter between the cover's right edge and the region's. */
export const LANDED_GUTTER = 24;

export function landedSquare(view: View): { x: number; y: number; size: number } {
  return { size: LANDED_SIZE, x: view.x + view.width - LANDED_GUTTER - LANDED_SIZE, y: view.y + (view.height - LANDED_SIZE) / 2 };
}
