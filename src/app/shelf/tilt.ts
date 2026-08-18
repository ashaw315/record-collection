/**
 * §10b's pulled record is "an object you turn". This is the turning: a
 * continuous, pointer-driven tilt, limited in range, which never reveals the
 * back.
 *
 * **The tilt and the flip are different acts and this module is only the
 * first.** The reference this borrows from (thecriterioncloset.com) does not
 * flip at all — its case turns ~15-20° off face-on, enough to show it has
 * thickness, and its own copy reads "move the mouse to turn it · click to put
 * it back". Front-to-back rotation is this project's own design and stays a
 * deliberate click with its own keyframe.
 *
 * **Why a pointer-driven tilt is not a third attempt at what failed twice.**
 * Both prior failures were a discrete face swap fighting an animation: a
 * `flipping` boolean whose return snapped, then two legs across two effects
 * with `FLIP_MS / 2` living in both a stylesheet and a `setTimeout`. A tilt has
 * no second state. The pointer moves, a value updates, the compositor renders —
 * nothing is ever halfway between two things because there is only one thing.
 * Same principle as unit 11's `@starting-style`: remove the state rather than
 * manage it.
 *
 * Pure, because the mapping is a decision. The angles reach the compositor
 * through a custom property with no transition, so there is no timing here and
 * deliberately no duration anywhere in TypeScript.
 */

/** The part of a `DOMRect` this needs, narrowed so a test can pass a literal. */
export type Rect = { left: number; top: number; width: number; height: number };

export type Tilt = { rotateX: number; rotateY: number };

/**
 * How far the record turns at the very edge of its own face.
 *
 * **16°, picked by rendering it and looking**, the way 1:12 and the shelf's 40%
 * minimum were picked rather than derived. The reference sits around 15-20°.
 *
 * Both failure directions are real and were checked on screen. Too little and
 * the record is a dead panel that happens to shift a few pixels — the motion
 * reads as a rendering artefact rather than as an object responding. Too much
 * and two things break at once: the flip stops being a separate act because the
 * tilt is already most of the way there, and the record's back edge starts to
 * come into view, which §10b reserves for the flip and which looks like a bug
 * on a sleeve with no modelled side.
 */
export const MAX_TILT_DEGREES = 16;

/**
 * Face-on. What a record shows when nothing is pointing at it, and what a
 * reduced-motion reader gets always (§10b: "reduced motion disables all of it"
 * — the record is not decorative, the turning is).
 */
export const NO_TILT: Tilt = { rotateX: 0, rotateY: 0 };

/**
 * The angles for a pointer at `pointer`, over a record occupying `face`.
 *
 * **Absolute position, never accumulated movement.** The same pointer position
 * always gives the same angle, whatever path the pointer took to get there.
 * That is what makes it an object being turned rather than a control being
 * driven: a delta-accumulating mapping drifts, so the record's angle depends on
 * history the user cannot see, and returning the pointer to where it started
 * does not return the record. Pinned by a round-trip test — a fixture that
 * moves the pointer once cannot tell the two designs apart.
 *
 * **The vertical axis is negated.** A positive CSS `rotateX` tips the top edge
 * away from the viewer; pointing near the top of a record should tip it toward
 * you, as tilting a real sleeve to catch the light does.
 *
 * Clamped at the face's own edge, so the pointer wandering onto the controls
 * below — which happens constantly, they sit right under the record — cannot
 * turn up an edge §10b reserves for the flip.
 */
export function tiltFor(pointer: { x: number; y: number }, face: Rect): Tilt {
  // A rect with no area means "not laid out yet". Dividing by it yields NaN,
  // and NaN in a custom property voids the transform silently — the record
  // would sit face-on with nothing to say it had failed.
  if (face.width === 0 || face.height === 0) return NO_TILT;

  // -1 at the left/top edge, 0 at the centre, +1 at the right/bottom.
  const fromCentreX = (pointer.x - (face.left + face.width / 2)) / (face.width / 2);
  const fromCentreY = (pointer.y - (face.top + face.height / 2)) / (face.height / 2);

  const clamp = (value: number) => Math.max(-1, Math.min(1, value));

  // `+ 0` normalises negative zero, which `-0 * 16` produces at dead centre.
  // Harmless in a transform string, but it makes "the centre is zero"
  // ambiguous to anything comparing angles, including this module's own test.
  const degrees = (unit: number) => clamp(unit) * MAX_TILT_DEGREES + 0;

  return {
    rotateX: degrees(-fromCentreY),
    rotateY: degrees(fromCentreX),
  };
}
