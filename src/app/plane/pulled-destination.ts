import { SPINE_HEIGHT } from '../shelf/spine';
import type { CanvasPx, FramePx, SceneZ, WallPx } from './frames';
import { raw, sceneZ, wallPx } from './frames';
import { WALL_FOV_DEGREES, viewportCameraDistance, wallCameraDistance } from './wall-camera';

/**
 * Where a pulled record ends up — an explicit pose, not an accident.
 *
 * **The rise had no destination.** §10b: "it was on the shelf a moment ago and
 * now it is in your hands." Unit 19's CSS version interpolated from the spine's
 * rect to an explicit settled rect; the scene version only knew "forward by a
 * proportion of the camera distance" and kept the slot's own height. So where a
 * record settled depended on which row it came from: measured at 125 records, a
 * row-0 record landed 252 world units above the view centre — NDC y 0.838,
 * clipped against the top of the frame.
 *
 * **A proportion of the camera distance is the wrong quantity**, and that is the
 * deeper reason. The camera frames the whole wall, so its distance scales with
 * the collection — a fixed fraction of it is a different absolute depth on a
 * one-row wall than on a nine-row one, and the record arrives a different size.
 * The destination has to be derived from how big the record should LOOK, which
 * is a property of the record and the lens, not of how many records are owned.
 */

/**
 * How much of the frame's height the settled record fills.
 *
 * Big enough to read a cover, small enough that the wall is still visible
 * behind it — the record is in your hands, not pressed against the lens.
 */
const FRAME_FILL = 0.55;

export type PulledPose = { x: WallPx; y: WallPx; z: SceneZ };

export function pulledDestination({
  wallWidth,
  wallHeight,
  viewport,
  widthFill,
  viewCentrePx,
  viewportHeight,
}: {
  wallWidth: WallPx;
  wallHeight: WallPx;
  /**
   * **Set when rendering on the wall, omitted for the pure-geometry tests.**
   *
   * The record's WIDTH only needs constraining when it is actually being shown:
   * the on-wall camera has the CANVAS aspect (a viewport aspect insets the wall
   * and breaks A24a, measured), so on a tall narrow canvas the record must be
   * pushed back to fit the frame's width. The tests that assert only WHERE the
   * record settles pass nothing and get the height-framed depth, unchanged.
   *
   * The dimensions themselves are not read — the width fit uses the canvas
   * aspect the camera already has — so this is a presence flag carrying its
   * reason, not a size input. Typed as the viewport it represents rather than a
   * bare boolean, so a caller passes what it means.
   */
  viewport?: { width: CanvasPx; height: CanvasPx };
  /**
   * How much of the frame's WIDTH the record fills when a viewport is given.
   * The stacked phone layout wants the record near full-bleed (≈0.9); the
   * default keeps the wall's framing (the record sits back in the scene). Only
   * consulted when `viewport` is set.
   */
  widthFill?: number;
  /**
   * **Where the record should sit on SCREEN — the visible viewport's centre, in
   * canvas pixels** (i.e. `scrollY + viewportHeight / 2`). When given, the
   * record settles at the visible centre regardless of which row its slot is in,
   * so it never depends on scroll and the rise does not have to scroll the wall
   * to bring it into view. Omitted → the wall's own centre, as before.
   *
   * Paired with `viewportHeight` because the record floats at the pull DEPTH,
   * not on the wall plane, so parallax shifts an off-axis point — the world-y is
   * solved through the projection rather than set to the raw canvas position.
   */
  viewCentrePx?: CanvasPx;
  viewportHeight?: FramePx;
}): PulledPose {
  /*
    **Framed on the VIEWPORT when one is given, not on the wall.** The wall
    framing makes the camera's distance scale with the collection, which puts the
    record behind the wall on a short one and far past the viewer on a tall one —
    see `viewportCameraDistance`. Callers without a viewport (the pure-geometry
    tests) keep the old derivation.
  */
  const cameraZ =
    viewportHeight === undefined
      ? wallCameraDistance({ wallHeight })
      : viewportCameraDistance({ viewportHeight });
  const halfAngle = (WALL_FOV_DEGREES * Math.PI) / 360;

  /*
    Solve for the distance at which a `SPINE_HEIGHT`-tall record fills
    `FRAME_FILL` of the frame's HEIGHT:

      frameHeight = 2 · distance · tan(halfAngle)
      SPINE_HEIGHT / frameHeight = FRAME_FILL
  */
  const byHeight = SPINE_HEIGHT / (2 * FRAME_FILL * Math.tan(halfAngle));

  /*
    **The aspect fix.** The camera's aspect is the CANVAS's — width/height of the
    wall — so the frame at a given depth is that ratio wide. On a tall narrow
    canvas (a phone: ~8:1 tall) a record framed by height alone is far too wide
    for the frame, and overflowed 4.5x. So the record must ALSO fit the viewport:
    pushed back until `SPINE_HEIGHT` fills at most `FRAME_FILL` of the frame's
    WIDTH, where the frame's width uses the canvas aspect the camera actually has.

      frameWidth = frameHeight · canvasAspect = 2 · distance · tan · (canvasW / canvasH)
      SPINE_HEIGHT / frameWidth = FRAME_FILL   ->   distance = SPINE_HEIGHT / (2 · FRAME_FILL · tan · canvasAspect)

    The record settles at whichever distance is FURTHER — the binding constraint,
    because further is smaller and a record that fits width and height both is at
    the max of the two. With no viewport, height alone decides, as before.
  */
  /*
    **The aspect of what the camera FRAMES.** This was `wallWidth / wallHeight`,
    which reintroduces the collection's size through the width fit even after the
    camera itself stopped scaling — a taller wall gave a narrower aspect and so a
    different settle distance. With a viewport given, the camera frames the
    viewport, so that is the ratio its frame has.
  */
  const canvasAspect = raw(wallWidth) / raw(viewportHeight ?? wallHeight);
  const byWidth =
    viewport === undefined
      ? 0
      : SPINE_HEIGHT / (2 * (widthFill ?? FRAME_FILL) * Math.tan(halfAngle) * canvasAspect);

  const distance = Math.max(byHeight, byWidth);


  return {
    // Centred across the wall.
    x: wallPx(raw(wallWidth) / 2),

    /**
     * **On the camera's axis**, which is the wall's centre.
     *
     * Two other answers were tried and measured wrong, and the reason is worth
     * recording: the camera is FIXED on the wall's centre, because A24b forbids
     * panning it. So "where the reader is looking" is not a property of the
     * scroll position at all — whatever is on the camera's axis is what appears
     * in the middle of the frame. Centring the record on the window put it at
     * NDC 0.62, and on the visible slice of the wall at 0.93; both are exactly
     * the offset from the axis, projected.
     *
     * That the wall may extend past the window is a SCROLL question, and the
     * canvas scrolls with the page — which is what the fixed camera bought.
     */
    y: viewY({ viewCentrePx, viewportHeight, wallHeight, cameraZ, distance, halfAngle }),
    z: sceneZ(raw(cameraZ) - distance),
  };
}

/**
 * **The record's world-y so it PROJECTS to the visible viewport centre.**
 *
 * The camera looks at the wall's centre (`-wallHeight/2`) and the canvas is 1:1
 * with world on the wall plane. The visible viewport centre is at canvas-px
 * `viewCentrePx`, whose world-y on the wall plane is `-viewCentrePx`. But the
 * record floats at the pull DEPTH, closer than the wall, so an off-axis point
 * there projects with parallax — 26 world units at a desktop wall, small but
 * visible as "slightly off-centre". So the y is solved through the projection:
 * take the target's NDC on the wall plane, and place the record at the world-y
 * that yields the same NDC at the record's own depth.
 *
 * With no `viewCentrePx` the record sits at the wall's centre, as before — the
 * geometry tests and any caller that does not pass a scroll position.
 */
function viewY({
  viewCentrePx,
  viewportHeight,
  wallHeight,
  cameraZ,
  distance,
  halfAngle,
}: {
  viewCentrePx?: CanvasPx;
  viewportHeight?: FramePx;
  wallHeight: WallPx;
  cameraZ: SceneZ;
  distance: number;
  halfAngle: number;
}): WallPx {
  const cameraY = -raw(wallHeight) / 2;
  if (viewCentrePx === undefined || viewportHeight === undefined) return wallPx(cameraY);

  // The target's world-y on the wall plane (canvas 1:1 with world there).
  const targetWorldY = -raw(viewCentrePx);
  // Its NDC-y through the fixed camera: offset from the axis over the frustum
  // half-height at the wall plane (z = 0).
  const halfHeightAtWall = raw(cameraZ) * Math.tan(halfAngle);
  const ndc = (targetWorldY - cameraY) / halfHeightAtWall;
  /*
    The frustum half-height at the RECORD's plane. The camera-to-record distance
    is `distance` (the record sits at z = cameraZ - distance, so the camera is
    `distance` in front of it), NOT `cameraZ - distance`. Getting that wrong put
    the record at NDC 0.23 where 0.66 was wanted — the parallax computed against
    the wrong plane.
  */
  const halfHeightAtRecord = distance * Math.tan(halfAngle);
  return wallPx(cameraY + ndc * halfHeightAtRecord);
}
