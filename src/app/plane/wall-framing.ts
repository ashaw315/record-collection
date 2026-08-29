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
  return SPINE_HEIGHT;
}



export function shelfSurfaceSpan(): { back: number; front: number } {
  /*
    **The depth runs FORWARD, toward the viewer.**

    The wall is at `z = 0` and the records back onto it, so there is no room
    behind them — a surface extending to negative z would be inside the wall. A
    real shelf viewed from the front shows the sleeve face toward you and the
    board running toward you underneath, and that is what this reproduces.

    Two earlier versions ran it the other way (`z = -210..30`), which put the
    records at the board's back edge with the depth trailing away behind them —
    Adam, twice: *"the shelf needs to be shifted towards the front of the
    records."*

    `SHELF_BACK_MARGIN` is the sliver behind the deepest record, enough that a
    tilt shows surface there rather than the record's own edge.
  */
  const back = -SHELF_BACK_MARGIN;
  return { back, front: back + shelfSurfaceDepth() };
}

/**
 * How much of the board sits BEHIND the records — just under half its depth.
 *
 * An 8px sliver left the records' back edge overhanging the board: from 3/4 the
 * rear corner hung past the shelf's rear edge with nothing under it. A real
 * shelf sets the sleeve back from the wall with clearance behind, and runs the
 * rest of its depth forward toward whoever is browsing.
 */
const SHELF_BACK_MARGIN = Math.round(SPINE_HEIGHT * 0.445);
