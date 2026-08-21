import { describe, expect, it } from 'vitest';
import {
  canTilt,
  dismiss,
  flip,
  nextFace,
  outRecordId,
  pull,
  settle,
  slide,
  showsBack,
  type RecordState,
} from './record-state';

/**
 * What the record is doing — one value, not six flags.
 *
 * **Pulled, rising, settled, tilting, flipping, returning have each been built
 * separately and now coexist.** That is the shape which has failed in this
 * project every time it has been built as separate booleans: the tilt fighting
 * the flip, the flip fighting the return, a record dismissed mid-flip sticking
 * because two owners disagreed about whether it was still out.
 *
 * So there is one state value and everything derives from it. The interactions
 * are the discriminating cases — a test of each feature alone cannot see them,
 * and they are exactly where a separate-flags design fails.
 */

const OUT: RecordState = { phase: 'settled', recordId: 'r1', face: 'front' };

describe('the record is in exactly one phase', () => {
  it('starts with nothing out', () => {
    const state: RecordState = { phase: 'idle' };
    expect(state.phase).toBe('idle');
  });

  it('goes idle -> rising -> settled', () => {
    const rising = pull({ phase: 'idle' }, 'r1');
    expect(rising.phase).toBe('rising');

    const settled = settle(rising);
    expect(settled.phase).toBe('settled');
    expect(outRecordId(settled)).toBe('r1');
  });

  it('keeps the face across a settle, so a flip is not undone by arriving', () => {
    const flipped = flip({ ...OUT, face: 'front' });
    expect(showsBack(settle(flipped))).toBe(showsBack(flipped));
  });
});

describe('dismiss', () => {
  it('sends a settled record home', () => {
    expect(dismiss(OUT).phase).toBe('returning');
  });

  it('sends a record home MID-FLIP rather than leaving it stuck', () => {
    /**
     * **The interaction the prompt names, and one a per-feature test cannot
     * see.** With separate flags, dismissing while `isFlipping` was true left
     * two owners disagreeing about whether the record was still out — and the
     * record stuck.
     *
     * One phase makes that unrepresentable: flipping IS a phase, and dismissing
     * from it goes to returning like any other.
     */
    const flipping: RecordState = { phase: 'flipping', recordId: 'r1', face: 'front' };
    const returning = dismiss(flipping);

    expect(returning.phase).toBe('returning');
    expect(outRecordId(returning), 'and it knows WHICH record to fly home').toBe('r1');
  });

  it('sends a record home MID-RISE', () => {
    const rising: RecordState = { phase: 'rising', recordId: 'r1', face: 'front' };
    expect(dismiss(rising).phase).toBe('returning');
  });

  it('does nothing when nothing is out', () => {
    expect(dismiss({ phase: 'idle' }).phase).toBe('idle');
  });

  it('does not restart a return already in flight', () => {
    /**
     * Escape pressed twice, or Escape during a click-dismiss. Restarting would
     * make the record jump back to where it started returning FROM.
     */
    const returning = dismiss(OUT);
    expect(dismiss(returning)).toEqual(returning);
  });
});

describe('flip', () => {
  it('turns a settled record to its back and back again', () => {
    const back = flip(OUT);
    expect(showsBack(back)).toBe(true);

    const front = flip(settle(back));
    expect(showsBack(front)).toBe(false);
  });

  it('does not flip a record that is on its way home', () => {
    /**
     * A record travelling back to its slot turning over mid-flight is two
     * motions fighting for the same axis. The phase makes the answer obvious
     * rather than requiring a guard at every call site.
     */
    const returning = dismiss(OUT);
    expect(flip(returning)).toEqual(returning);
  });

  it('does not flip when nothing is out', () => {
    expect(flip({ phase: 'idle' })).toEqual({ phase: 'idle' });
  });
});

describe('canTilt', () => {
  it('is true only for a record that has ARRIVED', () => {
    /**
     * **The tilt must not fight the rise or the return.** Both own the record's
     * rotation while they run; a pointer-driven tilt during either is two
     * things writing one value, which is unit 12's finding in a new place.
     */
    expect(canTilt(OUT)).toBe(true);
    expect(canTilt({ phase: 'rising', recordId: 'r1', face: 'front' })).toBe(false);
    expect(canTilt({ phase: 'returning', recordId: 'r1', face: 'front' })).toBe(false);
    expect(canTilt({ phase: 'idle' })).toBe(false);
  });

  it('is true while FLIPPING, because the two compose on different axes', () => {
    /**
     * The composition question the prompt asks. The flip owns Y — it is a
     * turn about the record's vertical axis. The tilt owns X and adds a small
     * Y offset on top of whatever the flip has reached, rather than replacing
     * it. Unit 12 resolved the CSS equivalent structurally by nesting; here the
     * equivalent is that the two contribute to one rotation rather than
     * competing to set it.
     */
    expect(canTilt({ phase: 'flipping', recordId: 'r1', face: 'front' })).toBe(true);
  });
});

describe('nextFace', () => {
  it('alternates, so a flip is a rotation rather than a state to keep in sync', () => {
    /**
     * The box has both faces, so this is a rotation of an object — which was
     * the whole argument for the box in unit 13. There is no "which side shows"
     * to keep in agreement with the geometry; the angle IS the answer.
     */
    expect(nextFace('front')).toBe('back');
    expect(nextFace('back')).toBe('front');
  });
});


describe('slide — a lateral move to an adjacent record (13b)', () => {
  it('slides from a settled record to the target, carrying the direction', () => {
    const state = slide({ phase: 'settled', recordId: 'a', face: 'front' }, 'b', 'next');
    expect(state).toEqual({ phase: 'sliding', fromId: 'a', toId: 'b', direction: 'next' });
  });

  it('slides from a flipping record too (a record that is out and still)', () => {
    const state = slide({ phase: 'flipping', recordId: 'a', face: 'back' }, 'b', 'previous');
    expect(state.phase).toBe('sliding');
  });

  it('does NOT slide while rising, returning, or already sliding', () => {
    /* Those own the motion; starting a slide mid-motion is two writers on one position. */
    const rising = { phase: 'rising', recordId: 'a', face: 'front' } as const;
    expect(slide(rising, 'b', 'next')).toBe(rising);
    const returning = { phase: 'returning', recordId: 'a', face: 'front' } as const;
    expect(slide(returning, 'b', 'next')).toBe(returning);
    const sliding = { phase: 'sliding', fromId: 'a', toId: 'b', direction: 'next' } as const;
    expect(slide(sliding, 'c', 'next')).toBe(sliding);
  });

  it('does not slide to the record already out', () => {
    const state = { phase: 'settled', recordId: 'a', face: 'front' } as const;
    expect(slide(state, 'a', 'next')).toBe(state);
  });

  it('settles a slide to the record it slid TO, face-on', () => {
    const settled = settle({ phase: 'sliding', fromId: 'a', toId: 'b', direction: 'next' });
    expect(settled).toEqual({ phase: 'settled', recordId: 'b', face: 'front' });
  });

  it('the record OUT during a slide is the one arriving (toId)', () => {
    expect(outRecordId({ phase: 'sliding', fromId: 'a', toId: 'b', direction: 'next' })).toBe('b');
  });

  it('dismissing a slide returns the arriving record', () => {
    const state = dismiss({ phase: 'sliding', fromId: 'a', toId: 'b', direction: 'next' });
    expect(state).toEqual({ phase: 'returning', recordId: 'b', face: 'front' });
  });

  it('a slide cannot be flipped mid-slide', () => {
    const sliding = { phase: 'sliding', fromId: 'a', toId: 'b', direction: 'next' } as const;
    expect(flip(sliding)).toBe(sliding);
  });

  it('a sliding record does not tilt and shows no back', () => {
    const sliding = { phase: 'sliding', fromId: 'a', toId: 'b', direction: 'next' } as const;
    expect(canTilt(sliding)).toBe(false);
    expect(showsBack(sliding)).toBe(false);
  });
});
