import { easeInOutCubic } from '@/app/wall/gesture';

/**
 * The record modal's turn (§M.5): "180 degrees about the sleeve's vertical
 * centre line", a rigid rotation, "in perspective during the motion only,
 * flat at rest".
 *
 * **Proposed by the build, not ruled.** §M.5: "The duration and curve are
 * not ruled... Code proposes them from the build, and Adam judges them from
 * a recording."
 *
 * - 600ms: long enough that the edge-on moment is seen and the face is
 *   watched arriving, short of the wall's 1000ms pull, which crosses a
 *   shelf where this turns in place.
 * - The wall's own ease, in and out: the sleeve starts and stops at rest,
 *   and is fastest edge-on, where there is least to look at.
 * - Seen from four sleeve-widths away. Nearer and the leading edge swells
 *   toward the reader; further and it flattens toward the narrowing and
 *   widening the ruling turned down.
 */
export const TURN_MS = 600;
export const TURN_PERSPECTIVE = 4;

export type TurnPose = {
  /** Which face is toward the reader: the one being left, or the one arrived at. */
  face: 'from' | 'to';
  /** Degrees about the vertical centre line; 0 is flat and face-on. */
  angle: number;
};

/**
 * The pose at `progress` of the turn, 0 to 1. The face changes edge-on, at
 * 90 degrees, and the arriving face is drawn from −90 back to 0 and never
 * past 90, so no face is ever seen from behind, mirrored.
 */
export function turnPose(progress: number): TurnPose {
  const turned = 180 * easeInOutCubic(progress);
  return turned < 90 ? { face: 'from', angle: turned } : { face: 'to', angle: turned - 180 };
}
