/**
 * What the record DOES as it comes off the shelf, as a pose per frame.
 *
 * **The rise was a rect interpolation the box happened to be drawn inside.**
 * Unit 19's FLIP moved position and scaled from the spine's rect to the settled
 * rect — no depth, no rotation — which was the right shape for a CSS plane and
 * is wrong for a box in a scene. It reads as a square shrinking and expanding:
 * correct at both endpoints, wrong for the whole middle.
 *
 * **A spine IS the edge of a record.** So the physical motion is not a change
 * of size at all. The record is edge-on in its slot; leaving the shelf means
 * coming forward off the wall plane and turning to face the viewer:
 *
 *   progress 0   edge-on (rotationY = 90°), in the wall plane (z = 0)
 *   progress 1   face-on (rotationY = 0°), forward of it (z = slotDepth)
 *
 * That is a rotation about Y plus a translation in Z, both of which are free
 * now that this is a real box under a real camera — and neither of which CSS
 * could have done convincingly, which is why A18 adopted the renderer.
 *
 * Pure, and swept in its tests rather than checked at the ends, because the
 * endpoints were already correct before this change and every defect lives in
 * between.
 */

import { easeRiseInOut } from './motion-tuning';

export type RisePose = {
  /** Radians about Y: π/2 is edge-on, 0 is face-on. */
  rotationY: number;
  /** Forward of the wall plane, in world units. */
  z: number;
  /** Overall size in the scene, spine-sized to full. */
  scale: number;
};

/**
 * **Ease at BOTH ends**, shared by rotation and depth.
 *
 * They are one movement, and easing them differently makes the turn and the
 * approach read as two separate things happening to the same object.
 *
 * This was a cubic ease-OUT, which leaps: velocity 2.85 off the mark and 39% of
 * the distance in the first 15% of the time — the record jumped, then coasted.
 * `easeRiseInOut` starts gently, is fastest mid-travel and settles, which is
 * what a hand lifting a record does.
 */
const easeOut = easeRiseInOut;

export function risePose({
  progress,
  slotDepth,
  startScale = 0.08,
}: {
  progress: number;
  /** How far forward of the wall the settled record sits. */
  slotDepth: number;
  /**
   * The record's size in the scene while it is still a spine.
   *
   * Not zero: the spine is a real object at a real size, and starting from
   * nothing would read as the record materialising rather than emerging.
   */
  startScale?: number;
}): RisePose {
  const t = Math.min(1, Math.max(0, progress));
  const eased = easeOut(t);

  return {
    /*
      From edge-on to face-on. The quarter turn is what makes the spine become
      a cover — the single most important thing this motion does, and the thing
      a rect interpolation cannot express at all.
    */
    rotationY: (Math.PI / 2) * (1 - eased),
    z: slotDepth * eased,
    scale: startScale + (1 - startScale) * eased,
  };
}
