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
