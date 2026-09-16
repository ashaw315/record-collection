import { COS30, SIN30, SPINE_HEIGHT, type Point } from './geometry';
import type { PullPose } from './pull-curve';

/**
 * The pulled record's face, in wall space (The Wall 5b §3).
 *
 * **Read off the frames, which are drawn at 1:1.** The five frames share a
 * viewBox with a 17 × 240 seated spine, and the last one is a 116 × 116
 * square whose top sits on the seated spine's top-right corner, 41 units to
 * the right of the slot. The record shrinks in height as it comes off the
 * shelf — that is what the drawing does, and the built pull was judged on it.
 *
 * **One polygon.** Frame 0 is exactly `spinePolygon`'s four points, so the
 * pull transforms the node the wall already drew rather than swapping one in.
 */
export const PULLED_SIZE = 116;
export const PULL_OFFSET_X = 41;

export type Seat = { x: number; y: number; width: number };

/**
 * The four points at a pose. Width follows the pose's scale, height and
 * travel its eased value, and the top edge's rise — the projection itself —
 * drains with its shear. All three from one curve, by construction.
 */
export function pullFace({ x, y, width }: Seat, pose: PullPose): readonly Point[] {
  const w = width * pose.scale;
  const h = SPINE_HEIGHT + (PULLED_SIZE - SPINE_HEIGHT) * pose.eased;
  const left = x + PULL_OFFSET_X * pose.eased;
  const lift = ((w * SIN30) / COS30) * pose.shear;

  return [
    [left, y + lift],
    [left + w, y],
    [left + w, y + h],
    [left, y + h + lift],
  ];
}
