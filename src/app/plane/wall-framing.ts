import { PLANE_DEPTH, LIP_DEPTH } from '../shelf/shelf-surface';
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
 * How far back the shelf's horizontal surface must run.
 *
 * A spine's box spans `z = 0` (flush with the wall) to `z = width`, so a shelf
 * shallower than the widest spine leaves part of every record's foot over
 * nothing — which is what makes the top row look like it overhangs and lets the
 * viewer see underneath it.
 *
 * **Derived from the spines rather than authored**, and deliberately not by
 * changing `PLANE_DEPTH`. That constant is about the visible LIP — "deeper than
 * this and the shelf reads as a plinth each row stands on" — which is a judgement
 * about what the eye sees at the shelf's front edge, not about how far the
 * surface runs back underneath the records where nothing is visible anyway.
 */
export function shelfSurfaceDepth({ deepestSpine }: { deepestSpine: number }): number {
  return deepestSpine;
}
