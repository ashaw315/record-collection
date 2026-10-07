import { easeOutCubic } from './sleeve-open';

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
 * - The ease-out cubic, which is ruled and not proposed: §M.5, "the turn and
 *   the gatefold's opening take the travel's curve", so the modal has one
 *   motion character. First built on the wall's ease in and out.
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
  const turned = 180 * easeOutCubic(progress);
  return turned < 90 ? { face: 'from', angle: turned } : { face: 'to', angle: turned - 180 };
}

/**
 * How far past its square, above and below, a square of side `side` is
 * drawn at edge-on when it turns about its centre line seen from
 * `distance`: its near edge stands side / 2 toward the reader.
 */
export function turnSwell(side: number, distance: number): number {
  return ((side / 2) * (side / 2)) / (distance - side / 2);
}

/**
 * The distance the turning sleeve is seen from (step 91, §M.5): four widths,
 * or further where four widths would carry its near edge into the top row.
 * `roomAbove` is the paper between the top row and the sleeve; the swell is
 * kept one pixel short of it. Where the square is bound by the window's
 * height that room is the 18 inset, and the turn is seen from much further
 * than on a phone, where the room is large: the same rule, and a visibly
 * weaker perspective on a desktop.
 */
export function turnDistance(side: number, roomAbove: number): number {
  const allowed = Math.max(1, roomAbove - 1);
  return Math.max(side * TURN_PERSPECTIVE, side / 2 + ((side / 2) * (side / 2)) / allowed);
}
