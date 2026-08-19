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
  | { phase: 'returning'; recordId: string; face: Face };

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

  return { phase: 'returning', recordId: state.recordId, face: state.face };
}

/** Turning the record over. */
export function flip(state: RecordState): RecordState {
  if (state.phase === 'idle' || state.phase === 'returning') return state;

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
  return state.phase !== 'idle' && state.face === 'back';
}

/** The record that is out, whatever it is doing. */
export function outRecordId(state: RecordState): string | null {
  return state.phase === 'idle' ? null : state.recordId;
}
