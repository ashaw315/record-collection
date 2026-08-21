/**
 * What the record is doing — one value, not six flags.
 *
 * **Pulled, rising, settled, tilting, flipping and returning were each built
 * separately and now coexist.** Held as booleans they are the shape that has
 * failed in this project every time: the tilt fighting the flip, the flip
 * fighting the return, a record dismissed mid-flip sticking because two owners
 * disagreed about whether it was still out.
 *
 * A phase makes those unrepresentable rather than merely unlikely. Dismissing
 * from `flipping` goes to `returning` like dismissing from anywhere else — there
 * is no combination of flags to get wrong, because there are no flags.
 *
 * **What is NOT a phase: the tilt.** It is a pointer-driven offset on top of
 * whatever the record is doing, not a thing the record is doing instead. That
 * is why `canTilt` is a question about the phase rather than a phase of its own
 * — and why the tilt and the flip compose rather than compete.
 */

export type Face = 'front' | 'back';

export type RecordState =
  | { phase: 'idle' }
  | { phase: 'rising'; recordId: string; face: Face }
  | { phase: 'settled'; recordId: string; face: Face }
  | { phase: 'flipping'; recordId: string; face: Face }
  | { phase: 'returning'; recordId: string; face: Face }
  /**
   * **A lateral move between records (13b).** The record being held slides off
   * one side and the next slides in from the other, at the same depth — NOT a
   * return through the shelf and a fresh rise. `fromId` leaves, `toId` arrives;
   * `direction` is which way they travel (the input decides it). The face
   * resets to front: the new record arrives face-on, as a pull does.
   */
  | { phase: 'sliding'; fromId: string; toId: string; direction: 'next' | 'previous' };

/** Pulling a record out of the wall. */
export function pull(state: RecordState, recordId: string): RecordState {
  return { phase: 'rising', recordId, face: 'front' };
}

/**
 * An animation finishing.
 *
 * **Keeps the face**, so arriving does not undo a flip that is still in flight
 * — the face is a property of the record, not of the motion that just ended.
 */
export function settle(state: RecordState): RecordState {
  if (state.phase === 'idle') return state;
  /* A slide settles to the record it slid TO, face-on (a new record arrives front). */
  if (state.phase === 'sliding') return { phase: 'settled', recordId: state.toId, face: 'front' };
  return { phase: 'settled', recordId: state.recordId, face: state.face };
}

/**
 * Sending the record home.
 *
 * Works from ANY phase in which a record is out, which is the point: mid-rise,
 * mid-flip, settled. A record dismissed mid-flip goes home rather than sticking.
 */
export function dismiss(state: RecordState): RecordState {
  if (state.phase === 'idle') return state;
  // A return already in flight is not restarted — Escape pressed twice, or
  // Escape during a click-dismiss, would otherwise jump the record back to
  // where the return began.
  if (state.phase === 'returning') return state;

  const recordId = state.phase === 'sliding' ? state.toId : state.recordId;
  const face = state.phase === 'sliding' ? 'front' : state.face;
  return { phase: 'returning', recordId, face };
}

/**
 * Sliding laterally to an adjacent record (13b).
 *
 * **Only from settled or flipping** — a record that is out and still. Not
 * during a rise, a return, or another slide: those own the record's motion, and
 * starting a slide mid-motion is two things writing one position, the shape unit
 * 12 resolved structurally. The caller has already resolved the neighbour id and
 * that there IS one (the arrow is absent at the ends).
 */
export function slide(
  state: RecordState,
  toId: string,
  direction: 'next' | 'previous',
): RecordState {
  if (state.phase !== 'settled' && state.phase !== 'flipping') return state;
  if (state.recordId === toId) return state;
  return { phase: 'sliding', fromId: state.recordId, toId, direction };
}

/** Turning the record over. */
export function flip(state: RecordState): RecordState {
  /* Not while idle, returning, or SLIDING — a slide owns the record's motion. */
  if (state.phase === 'idle' || state.phase === 'returning' || state.phase === 'sliding') {
    return state;
  }

  return { phase: 'flipping', recordId: state.recordId, face: nextFace(state.face) };
}

/**
 * Whether the pointer may tilt the record.
 *
 * **Not while the rise or the return is running.** Both own the record's
 * rotation for their duration, and a pointer-driven tilt during either is two
 * things writing one value — unit 12's finding, which was resolved structurally
 * rather than by arbitration.
 *
 * **True while FLIPPING**, because the two compose: the flip owns Y and the
 * tilt adds X plus a small Y offset on top of whatever the flip has reached.
 * They contribute to one rotation rather than competing to set it.
 */
export function canTilt(state: RecordState): boolean {
  return state.phase === 'settled' || state.phase === 'flipping';
}

/** Which face a flip turns to. */
export function nextFace(face: Face): Face {
  return face === 'front' ? 'back' : 'front';
}

/** Whether the back is showing — derived, never stored separately. */
export function showsBack(state: RecordState): boolean {
  /* A sliding record has no face yet — it arrives front-on when it settles. */
  if (state.phase === 'idle' || state.phase === 'sliding') return false;
  return state.face === 'back';
}

/** The record that is out, whatever it is doing. */
export function outRecordId(state: RecordState): string | null {
  if (state.phase === 'idle') return null;
  if (state.phase === 'sliding') return state.toId;
  return state.recordId;
}
