import { SPINE_HEIGHT } from '../shelf/spine';
import { WALL_FOV_DEGREES, wallCameraDistance } from './wall-camera';

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

export type PulledPose = { x: number; y: number; z: number };

export function pulledDestination({
  wallWidth,
  wallHeight,
}: {
  wallWidth: number;
  wallHeight: number;

}): PulledPose {
  const cameraZ = wallCameraDistance({ wallHeight });
  const halfAngle = (WALL_FOV_DEGREES * Math.PI) / 360;

  /*
    Solve for the distance at which a `SPINE_HEIGHT`-tall record fills
    `FRAME_FILL` of the frame:

      frameHeight = 2 · distance · tan(halfAngle)
      SPINE_HEIGHT / frameHeight = FRAME_FILL

    This is independent of the wall's height, which is the whole point: five
    records and five hundred put the camera in different places and the record
    arrives the same apparent size.
  */
  const distance = SPINE_HEIGHT / (2 * FRAME_FILL * Math.tan(halfAngle));

  return {
    // Centred across the wall.
    x: wallWidth / 2,

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
    y: -wallHeight / 2,
    z: cameraZ - distance,
  };
}
