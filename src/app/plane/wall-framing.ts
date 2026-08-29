import { PLANE_DEPTH, LIP_DEPTH } from '../shelf/shelf-surface';
import { MAX_SPINE_WIDTH, SPINE_HEIGHT } from '../shelf/spine';
import { WALL_FOV_DEGREES } from './wall-camera';

/**
 * **The shelf's depths, re-exported for the WebGL wall.**
 *
 * They were authored for the CSS shelf (`shelf-surface.ts`) and the WebGL wall
 * drew flat quads instead, so the constants existed and nothing used them. Named
 * here rather than duplicated, because two shelves disagreeing about their own
 * depth is the duplication this scene already has too many of.
 */
export const SHELF_PLANE_DEPTH = PLANE_DEPTH;
export const SHELF_LIP_DEPTH = LIP_DEPTH;

const halfAngleTan = () => Math.tan((WALL_FOV_DEGREES * Math.PI) / 360);

/**
 * How much of a spine's top the wall-plane framing cuts off.
 *
 * The camera is placed so the wall EXACTLY fills the frame at `z = 0`, which
 * puts the frustum's top edge at `y = 0` — precisely the top of row 0, with no
 * margin. Spines are boxes standing in front of that plane, and a perspective
 * frustum is narrower nearer the camera, so at the spine's own depth the visible
 * top has dropped by this much and the spine's cap is outside the frame.
 *
 * **A function of spine depth and FOV only.** Wall height cancels: it sets both
 * the camera distance and the frame height, so it scales both sides equally.
 * That is why the clipping is the same ~1.7px on a one-record wall and a
 * 125-record one, and why looking at a large collection never revealed it.
 */
export function topClipMargin({ spineDepth }: { spineDepth: number }): number {
  return spineDepth * halfAngleTan();
}

/**
 * Camera distance that frames the wall at the plane the SPINES occupy.
 *
 * `wallCameraDistance` frames the wall plane at `z = 0`, where nothing is drawn
 * — the spines, the shelf and the records all stand in front of it. Framing the
 * empty plane and then drawing everything closer is what clipped the top row.
 *
 * Standing back by `spineDepth` restores exactly what the narrowing took: the
 * frustum at `z = spineDepth` is then the frustum the wall plane used to get.
 *
 * With `spineDepth` 0 this is `wallCameraDistance` unchanged, which is what the
 * pure-geometry callers expect.
 */
export function framedCameraDistance({
  wallHeight,
  spineDepth,
}: {
  wallHeight: number;
  spineDepth: number;
}): number {
  return wallHeight / 2 / halfAngleTan() + spineDepth;
}

/**
 * How deep the shelf's horizontal surface runs: **as deep as a RECORD, plus a
 * small overhang at the front.**
 *
 * Two wrong answers preceded this, and both were found by looking rather than by
 * arithmetic:
 *
 * 1. **`MAX_SPINE_WIDTH` (24px)** — exactly as deep as the record standing on
 *    it, so no surface was visible behind the records at any angle. The shelf
 *    could not be seen because there was nothing to see.
 * 2. **`SPINE_HEIGHT` (240px)**, on the reasoning that a 12" sleeve is square.
 *    True of a sleeve lying flat and wrong here: **these records stand EDGE-ON,
 *    so what occupies shelf depth is a record's THICKNESS.** A shelf ten times
 *    deeper than the thing on it reads as a plank the records are perched on the
 *    front of — visible immediately in the 3/4 orbit, invisible square-on.
 *
 * Adam: *"match the shelf's depth to a record's depth with a small overhang at
 * the front, and put the records on the surface rather than in front of it."*
 */
export function shelfSurfaceDepth(): number {
  return MAX_SPINE_WIDTH + SHELF_FRONT_OVERHANG + SHELF_BACK_MARGIN;
}

/**
 * How far the surface reaches behind the deepest record.
 *
 * Enough that a record reads as standing ON a surface rather than at the edge of
 * one; small enough that the shelf does not run away behind them as a plank.
 */
const SHELF_BACK_MARGIN = 8;

export function shelfSurfaceSpan(): { back: number; front: number } {
  /*
    The record spans `z = 0..width`. The surface brackets it: `SHELF_BACK_MARGIN`
    behind the wall plane and `SHELF_FRONT_OVERHANG` past the deepest record, so
    the record stands ON the surface with a little visible either side rather
    than perched at one end of a plank.
  */
  const front = MAX_SPINE_WIDTH + SHELF_FRONT_OVERHANG;
  return { back: -SHELF_BACK_MARGIN, front };
}

/**
 * How far the surface projects past the deepest record.
 *
 * Enough that the record is standing ON the shelf rather than at its very lip;
 * small enough that the shelf does not read as a ledge the records sit back from.
 */
const SHELF_FRONT_OVERHANG = 6;
