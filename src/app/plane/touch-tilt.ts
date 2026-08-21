import { type Tilt } from '../shelf/tilt';

/**
 * **The touch-tilt gesture boundary, as a decision separate from the raycast.**
 *
 * §10b: "on touch it is dragged." The record turns under a finger; the wall
 * scrolls under a finger. Those compete, and the boundary is: a touch that lands
 * ON the pulled record starts a tilt drag; a touch anywhere else does not, and
 * is left to the tap/dismiss handler and the browser's own scroll.
 *
 * The raycast (did the touch hit the pulled mesh?) is three.js and lives in the
 * scene. This module is the part that is a DECISION rather than a query: given
 * whether the touch hit the record, and the phase, should a tilt drag begin —
 * and how a drag ends. Pure, so the boundary can be pinned without a canvas.
 *
 * **The hold rule (§10b, and the reason it is here).** A record you have turned
 * stays turned when the finger lifts — the same as the pointer version, which
 * holds its last angle rather than springing to rest. So `endDrag` does NOT
 * reset the tilt; it only stops the drag. Resetting on release would pass a test
 * that checks the angle changed during the drag and never notice the spring.
 */

/** Whether a touch beginning now should start a tilt drag. */
export function shouldStartTiltDrag({
  hitRecord,
  canTilt,
  reducedMotion,
}: {
  /** Did the touchstart raycast hit the pulled record's mesh? */
  hitRecord: boolean;
  /** Is the record in a phase that tilts (settled or flipping)? */
  canTilt: boolean;
  /** Has the reader asked for less motion? Then the record does not turn. */
  reducedMotion: boolean;
}): boolean {
  /*
    Only a touch ON the record, only when it can tilt, only when motion is
    allowed. A touch on empty wall returns false here and falls through to the
    tap/dismiss path — which is what keeps the tap working (a drag handler that
    claimed every touch would swallow it).
  */
  return hitRecord && canTilt && !reducedMotion;
}

/**
 * The drag's state across a touch. Deliberately tiny: a boolean and the last
 * angle, because the tilt itself is `tiltFor` and the angle lives in the scene.
 */
export type TiltDrag = { active: boolean; tilt: Tilt | null };

export const NO_DRAG: TiltDrag = { active: false, tilt: null };

/** A touch that hit the record begins a drag; the first move will set the tilt. */
export function beginDrag(): TiltDrag {
  return { active: true, tilt: null };
}

/**
 * The finger lifts. **The drag stops; the tilt is KEPT** (the hold rule). The
 * last angle is preserved so the scene does not reset the record to face-on.
 */
export function endDrag(drag: TiltDrag): TiltDrag {
  return { active: false, tilt: drag.tilt };
}

/**
 * **Distinguishing a navigation swipe from a tilt drag (13b), geometrically.**
 *
 * Both start as a finger moving sideways on the record, so the boundary is the
 * gesture-boundary problem one layer in. It is decided at RELEASE, from the net
 * displacement — and the threshold is a GEOMETRIC quantity, not a derived
 * number: a swipe is a drag whose horizontal travel exceeds half the record's
 * on-screen width AND is dominantly horizontal. Half the record width is the
 * distance from centre to edge; a drag that crosses it has travelled past the
 * record itself, which reads as "leave this one" rather than "turn this one".
 * It is hand-independent because it scales with the record, not with a guess at
 * how far a thumb flicks.
 *
 * During the drag the record tilts (live feedback, `tiltFor`); only the release
 * decides. A swipe that commits snaps the tilt back, because the record is
 * leaving.
 */
export type SwipeResult = 'next' | 'previous' | null;

export function swipeDirection({
  dx,
  dy,
  recordWidth,
}: {
  /** Net horizontal displacement from touchstart to touchend (px). */
  dx: number;
  /** Net vertical displacement (px). */
  dy: number;
  /** The record's on-screen width (px). */
  recordWidth: number;
}): SwipeResult {
  const horizontalReach = recordWidth / 2;

  /*
    Dominantly horizontal: the horizontal travel is greater than the vertical,
    so a mostly-vertical drag (or a diagonal tilt) does not read as a swipe.
    And it must clear half the record's width — past the record's own edge.
  */
  if (Math.abs(dx) <= Math.abs(dy)) return null;
  if (Math.abs(dx) < horizontalReach) return null;

  /*
    A swipe LEFT (dx negative, the finger moves toward the left) reveals the
    NEXT record, the way a gallery advances — the content moves left as the next
    slides in. Right is previous.
  */
  return dx < 0 ? 'next' : 'previous';
}
