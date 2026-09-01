import { PLANE_DEPTH, LIP_DEPTH } from '../shelf/shelf-surface';
import { SPINE_HEIGHT } from '../shelf/spine';
import type { SceneZ, WallPx } from './frames';
import { raw, sceneZ, wallPx } from './frames';
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
export function topClipMargin({ spineDepth }: { spineDepth: SceneZ }): WallPx {
  return wallPx(raw(spineDepth) * halfAngleTan());
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
  wallHeight: WallPx;
  spineDepth: SceneZ;
}): SceneZ {
  return sceneZ(raw(wallHeight) / 2 / halfAngleTan() + raw(spineDepth));
}

/**
 * How deep the shelf's horizontal surface runs: **as deep as a RECORD, plus a
 * small overhang at the front.**
 *
 * Two wrong answers preceded this, and both were found by looking rather than by
 * arithmetic:
 *
 * 1. **The deepest spine's width (24px)** — exactly as deep as the record standing on
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
export function shelfSurfaceDepth(): SceneZ {
  return sceneZ(SPINE_HEIGHT);
}



export function shelfSurfaceSpan(): { back: SceneZ; front: SceneZ } {
  /*
    **The board is set back from the records by `SHELF_BACK_MARGIN`, and runs
    forward from there.**

    `+z` is toward the camera and the wall sits at `z = 0`, so most of a shelf's
    depth has to extend toward the viewer — which is also what a real shelf looks
    like from the front: the sleeve face toward you, the board running toward you
    underneath.

    The remaining question — how much board should sit BEHIND the records — has
    no derivation. It was settled over four increments of Adam looking at the 3/4
    orbit and saying how much further, from 3% of the depth to 44.5%. See
    `SHELF_BACK_MARGIN`.
  */
  const back = sceneZ(-SHELF_BACK_MARGIN);
  return { back, front: sceneZ(raw(back) + raw(shelfSurfaceDepth())) };
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

/**
 * **Where the shelf's BACK PANEL sits, in scene Z.**
 *
 * A shelf has a back, and this one did not: the board and the lip existed and
 * behind them was nothing. `WALL_BACK` is `scene.background` — a clear colour,
 * not geometry — so from the 3/4 orbit the shelves read as slabs floating in
 * space, and nothing in the scene could receive a shadow.
 *
 * **This is correctness rather than cosmetics.** Adam: *"A real shelf has a back
 * panel, and its absence is why nothing can receive a shadow and why the orbit
 * view reads as slabs floating in space."* The orbit view was showing a true
 * fact about the model, not a rendering artefact.
 *
 * **At the back of the shelf's own depth**, so it closes the box the board and
 * lip already describe. Everything else in the scene — spines at `z ≈ +12`, the
 * board spanning -107..133 — is in front of it, which is what makes it a back
 * rather than an occluder.
 *
 * ---
 *
 * **WHAT THIS DOES NOT DO, recorded so it is not expected of it.**
 *
 * It does not give the PULLED record a contact shadow. That record settles
 * ~1552 units forward of the wall, which is **6.9x its own height** from this
 * panel; a cast shadow at that distance is large, faint and diffuse — ambient
 * darkening rather than contact. That is geometry and no amount of shadow-map
 * resolution changes it.
 *
 * What it does do is let the shadows already being cast land somewhere: the
 * spines sit ~12 units off it, **0.05x their height**, which is the ratio that
 * reads as an object standing ON something.
 */
export function shelfBackPanelZ(): SceneZ {
  return shelfSurfaceSpan().back;
}
