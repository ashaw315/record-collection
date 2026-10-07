import { MODAL_INSET, sleeveSquare } from './sleeve-modal';

/**
 * The gatefold's opening (§M.4, §M.5): the geometry of one motion.
 *
 * "In one motion, the front panel rotates about the fold while the whole
 * sleeve moves right by half a square, so the spread ends centred... Where
 * two squares at the closed size do not fit... the sleeve also scales down
 * to the largest spread that fits, in the same motion."
 */

/**
 * Proposed by the build, not ruled: the opening's duration, the turn's own
 * 600ms, so the modal's two rotations take the same time. §M.5: "The
 * durations are not ruled."
 */
export const OPEN_MS = 600;

/** §M.5 and §M.7: "the ease-out cubic", ruled for the travel and taken by the turn and the gatefold's opening. */
export function easeOutCubic(t: number): number {
  const k = Math.min(1, Math.max(0, t));
  return 1 - (1 - k) ** 3;
}

/**
 * One leaf of the open spread: the closed square where two of them fit
 * across the viewport inside the 18 insets, and otherwise the largest pair
 * that does. "Which on a phone is always."
 */
export function spreadSquare(viewportWidth: number, viewportHeight: number): number {
  const closed = sleeveSquare(viewportWidth, viewportHeight);
  return Math.max(0, Math.min(closed, Math.floor((viewportWidth - 2 * MODAL_INSET) / 2)));
}

export type OpenPose = {
  /** The side of each leaf at this moment. */
  size: number;
  /** Where the fold stands, from the centre the spread ends on: −S/2 closed, 0 open. */
  fold: number;
  /** What is rotating: the front panel, hinged at its left edge, or the left leaf it becomes, hinged at its right. */
  panel: 'front' | 'left';
  /** Degrees about the fold. The front swings toward the reader from 0 to −90; the left leaf lies down from 90 to 0. */
  angle: number;
};

/**
 * The pose at eased value `e`, 0 closed to 1 open, for a closed square
 * `closed` and a spread square `spread`. The move, the scale and the
 * rotation all read the one value, which is what makes it one motion.
 *
 * The derivation §M.4 gives, with x from the centre c the spread ends on:
 * the closed sleeve spans −S/2 to S/2, so its left edge, the fold, is at
 * −S/2; open, the fold is at 0 and the leaf that stays spans 0 to S. So
 * the fold moves RIGHT by S/2.
 *
 * The panel changes edge-on. Past 90 degrees it is drawn as the left leaf,
 * hinged at its right edge and laid down from 90 to 0, so the inside is
 * never the front's reverse seen mirrored.
 */
export function openPose(e: number, closed: number, spread: number): OpenPose {
  const k = Math.min(1, Math.max(0, e));
  const swung = 180 * k;
  const size = closed + (spread - closed) * k;
  const fold = k === 1 ? 0 : (-closed / 2) * (1 - k);
  return swung < 90 ? { size, fold, panel: 'front', angle: swung === 0 ? 0 : -swung } : { size, fold, panel: 'left', angle: 180 - swung };
}

/** As `turnSwell`, for a panel hinged at its edge: at edge-on its far edge stands a whole side toward the reader. */
export function openSwell(side: number, distance: number): number {
  return ((side / 2) * side) / (distance - side);
}

/** As `turnDistance` (step 91), for the gatefold's panel: four widths, or further where its swell would reach the top row. */
export function openDistance(side: number, roomAbove: number): number {
  const allowed = Math.max(1, roomAbove - 1);
  return Math.max(side * 4, side + ((side / 2) * side) / allowed);
}
