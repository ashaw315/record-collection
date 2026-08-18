/**
 * §10b's three faces, as a state machine.
 *
 * "**A gatefold opens; it does not turn.** A sleeve that folds out is a third
 * state, reached by a different gesture from turning the record over, because
 * it is a different physical act. Front → turn → back is rotation; front → open
 * → inner spread is a hinge."
 *
 * Two gestures, not one cycle. A single control stepping
 * front → back → gatefold → front would make one motion do two jobs and lose
 * the distinction §10b is explicit about.
 *
 * Pure because the transitions are the decision, and a component test would
 * drive clicks and confirm whatever the component did rather than stating what
 * should happen.
 */

export type Face = 'front' | 'back' | 'gatefold';

/**
 * What the record has to show.
 *
 * **Two leaves rather than one inner url**, because §10b's affordance turns on
 * having BOTH: a single field could not distinguish a fully photographed
 * gatefold from a half-photographed one, and that difference is the rule.
 */
export type FaceSources = {
  backUrl: string | null;
  gatefoldLeftUrl: string | null;
  gatefoldRightUrl: string | null;
};

export type Gesture = 'turn' | 'open' | 'close';

/**
 * Which faces this record has.
 *
 * **Front and back always.** §10b: "the back face is never empty … every record
 * is a two-sided object from the day it is entered" — a record with no
 * photographs still turns over, because the back composes from stored fields.
 *
 * **Gatefold only where BOTH leaves have been photographed** (§10b as amended
 * by A21c). One is not enough: a hinge opening onto artwork on one side and a
 * blank on the other invents exactly the thing the reader came to see, in the
 * most conspicuous place available. The lone leaf is still stored and still
 * appears in the gallery — it is a real photograph — it simply does not open
 * the sleeve.
 *
 * A photographed BACK does not qualify either: a back and an inner spread are
 * different surfaces, and only one of them folds.
 */
export function availableFaces(sources: FaceSources): Face[] {
  return hasGatefold(sources) ? ['front', 'back', 'gatefold'] : ['front', 'back'];
}

/** Both leaves, or no hinge. Neither leaf is privileged over the other. */
function hasGatefold(sources: FaceSources): boolean {
  return sources.gatefoldLeftUrl !== null && sources.gatefoldRightUrl !== null;
}

export function nextFace(current: Face, gesture: Gesture, sources: FaceSources): Face {
  if (gesture === 'close') return 'front';

  if (gesture === 'turn') {
    /**
     * Rotation, and symmetric: §10b's "click again puts it back".
     *
     * From an OPEN gatefold, turning returns to the front rather than advancing
     * to the back. The sleeve is open in the reader's hands and the natural
     * closing motion puts it face-up; sending them to a face they never turned
     * it to would be the cycle this deliberately is not.
     */
    return current === 'front' ? 'back' : 'front';
  }

  /**
   * The hinge, also symmetric — opening and closing are one gesture.
   *
   * Refuses when there is nothing inside. The control is not rendered without a
   * gatefold image, so this is unreachable from the UI today; it is guarded
   * anyway because a state machine that would enter a face with nothing to show
   * is one refactor away from rendering a blank panel where §10b promises
   * artwork.
   *
   * Opening works from the BACK too: a record turned over is still a fold-out,
   * and requiring it front-side up first would be a rule about the software
   * rather than about the object.
   */
  if (!hasGatefold(sources)) return current;

  return current === 'gatefold' ? 'front' : 'gatefold';
}
