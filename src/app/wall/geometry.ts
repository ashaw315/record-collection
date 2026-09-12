import type { ShelfRun } from './shelf-runs';

/**
 * The geometry both wall components share (The Wall 5b §1).
 *
 * **This layer exists so the labelled component inherits its decisions rather
 * than re-making them.** The overview draws polygons and the 1:1 component
 * draws polygons plus labels and the pull — but a projection settled inside
 * either renderer is one the other cannot reuse, and two renderers that each
 * decide a spine's width give a record that changes thickness when labels
 * appear.
 *
 * Pure, and testable without rendering anything.
 */

/** 30°, the isometric basis. */
const COS30 = Math.cos(Math.PI / 6);
const SIN30 = 0.5;

/**
 * **The wall's constant, and everything else derives from it.**
 *
 * §1 is explicit that the design file drew at 120 as a convenience, adopted it
 * as a constant, reasoned from it, and produced its one wrong conclusion — that
 * the wall carries no labels. A 9px label needs a 13.5-unit band across the
 * spine at ANY scale, because 9px is an absolute floor rather than a
 * proportion: it does not shrink when the spine does. At 120 the thickest
 * record is 11 units and the band cannot fit; at 240 it fits the THINNEST with
 * 3.5 units to spare.
 */
export const SPINE_HEIGHT = 240;

/** §1: the real thickness bounds, derived so they follow SPINE_HEIGHT. */
export const SPINE_WIDTH_MIN = Math.round(SPINE_HEIGHT / 14);
export const SPINE_WIDTH_MAX = Math.round(SPINE_HEIGHT / 10);

/** §1's depth, giving the 1:12 mean proportion. */
export const DEPTH = 52;

/**
 * Vertical space between one shelf and the next.
 *
 * **PROVISIONAL. Authored, not measured.** The density drawings state this
 * plainly: the 48 is "mine rather than read from the scene". It was 24 before
 * the 120→240 rescale and was doubled with everything else — which transformed
 * an assumption instead of re-deriving it. Every figure built on it inherits
 * that: the flat-vs-lit vertical cost of 2.4× is **the ratio's direction and
 * not its value**, and the 688px shelf pitch and the 33%-ink figure rest on it
 * too.
 *
 * **What would settle it:** a gap between shelves is a visual judgement about
 * how separate two shelves should read, and nothing in the density work
 * measured that — the 2.4× inherited the number rather than testing it. It
 * needs looking at once the overview renders five shelves at true size, which
 * is the first time the question can actually be asked. Until then this is a
 * value in use, not a value decided.
 *
 * Do not derive a new constant from it without saying the same thing again.
 */
export const SHELF_GAP = 48;

/** A point in wall space. */
export type Point = readonly [number, number];

/**
 * How thick a given record's spine is.
 *
 * **One record, one width, from both components.** §1 notes the per-record
 * field this should derive from was not read, so thickness is currently spread
 * across the real 17–24 bounds by a stable hash of the id — invented within
 * real bounds, exactly as the drawing did. When the real field lands, this is
 * the one place it goes.
 */
export function spineWidth(recordId: string): number {
  let hash = 0;
  for (let index = 0; index < recordId.length; index += 1) {
    hash = (hash * 31 + recordId.charCodeAt(index)) % 100_000;
  }

  const span = SPINE_WIDTH_MAX - SPINE_WIDTH_MIN;
  return SPINE_WIDTH_MIN + (hash % (span + 1));
}

/**
 * A seated spine's four points, sheared into the isometric.
 *
 * The top edge rises to the right by `width * tan(30°)` — **that rise IS the
 * projection**, and the 1:1 component's pull resolves it to zero from exactly
 * this starting value.
 *
 * `x`/`y` is the spine's top-right corner, so translation never reshapes it.
 */
export function spinePolygon(x: number, y: number, width: number): readonly Point[] {
  const lift = (width * SIN30) / COS30;

  return [
    [x, y + lift],
    [x + width, y],
    [x + width, y + SPINE_HEIGHT],
    [x, y + SPINE_HEIGHT + lift],
  ];
}

/**
 * The unbroken outline beneath one run.
 *
 * **§2's distinction is drawn here, which makes this the layer that tells the
 * lie if it is wrong.** Between groups the outline stops and restarts, because
 * there is no shelf there; within a group it runs unbroken under an empty slot,
 * because the shelf is still there and the record is not on it. Same mark,
 * different owner.
 *
 * The origin is REQUIRED rather than defaulting to zero. Two runs of equal
 * length would otherwise produce identical polygons and draw on top of each
 * other — and where a run sits is the geometry's decision, not something each
 * renderer re-derives.
 *
 * So the outline spans the run's SEATED EXTENT — the space the run occupies,
 * not the records still on it. A pulled record leaves its slot empty and the
 * shelf beneath it whole; shortening the polygon would draw the other absence
 * just as surely as splitting it would.
 */
export function shelfPolygon(run: ShelfRun, originX: number, originY: number): readonly Point[] {
  /* The extent counts every SEAT, including the one whose record is pulled. */
  const span = run.seatCount * SPINE_WIDTH_MAX;
  const rise = (span * SIN30) / COS30;
  const y = originY + SPINE_HEIGHT;

  return [
    [originX, y + rise],
    [originX + span, y],
    [originX + span, y + DEPTH],
    [originX, y + DEPTH + rise],
  ];
}
