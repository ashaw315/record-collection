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
 * How far back the shelf's horizontal surface runs: **as deep as a record is
 * tall, because a 12" sleeve is SQUARE.**
 *
 * The first version derived this from the deepest spine's WIDTH, which made the
 * plane exactly as deep as the record standing on it — so the surface visible
 * BEHIND the records was zero, at every angle, by construction. The shelf could
 * not be seen because there was nothing there to see, not because the camera
 * was square-on.
 *
 * Adam, on the 20° comparison: *"At 20° I can see the top of every record and
 * still nothing of the surface they stand on. That is not occlusion hiding the
 * shelf. There is no surface there to hide."*
 *
 * A record occupies its own THICKNESS of depth — 17-24px here, §10b's 1:12. The
 * shelf runs back the sleeve's full dimension, and the sleeve is square, so that
 * is `SPINE_HEIGHT`. The wall is drawn one wall-pixel to one screen-pixel and a
 * spine is 240px tall, so the shelf is 240px deep. The previous value was short
 * by a factor of ten.
 *
 * Nothing behind the wall plane is ever seen, so the extra depth costs one quad
 * and no legibility.
 */
export function shelfSurfaceDepth(): number {
  return SPINE_HEIGHT;
}

/**
 * Where the shelf's surface begins and ends along Z.
 *
 * **`+z` is toward the camera**, and a record's box spans `z = 0..width` with its
 * back flush against the wall. So a surface spanning `z = 0..240` runs 216px
 * toward the VIEWER — the records end up perched on its rear edge with a plank
 * jutting out in front of them under nothing at all.
 *
 * Adam: *"the shelf runs out before the records do, so they are standing partly
 * on nothing"* — the same defect seen from the front.
 *
 * A shelf you browse holds the record at the FRONT, sleeve face-on, with the
 * surface running BACK toward the wall. So the surface starts behind the wall
 * plane and ends just past the deepest record: the record stands on the front
 * portion, and what is visible behind it when the camera tilts is shelf.
 *
 * The small overhang past the deepest spine is deliberate — a record sitting
 * exactly flush with the front edge reads as about to fall off.
 */
export function shelfSurfaceSpan(): { back: number; front: number } {
  const front = MAX_SPINE_WIDTH + SHELF_FRONT_OVERHANG;
  return { back: front - shelfSurfaceDepth(), front };
}

/**
 * How far the surface projects past the deepest record.
 *
 * Enough that the record is standing ON the shelf rather than at its very lip;
 * small enough that the shelf does not read as a ledge the records sit back from.
 */
const SHELF_FRONT_OVERHANG = 6;
