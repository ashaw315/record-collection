import { describe, expect, it } from 'vitest';
import { beginDrag, endDrag, shouldStartTiltDrag, swipeDirection, NO_DRAG } from './touch-tilt';
import { NO_TILT, type Tilt } from '../shelf/tilt';

/**
 * The touch-tilt gesture boundary. The tilt MATH is `tilt.ts` (already tested);
 * this pins the DECISION — which touches start a drag, and that a drag holds its
 * angle on release rather than springing home.
 */

describe('shouldStartTiltDrag', () => {
  const base = { hitRecord: true, canTilt: true, reducedMotion: false };

  it('starts when the touch hits the record, it can tilt, and motion is allowed', () => {
    expect(shouldStartTiltDrag(base)).toBe(true);
  });

  /**
   * **The discriminating case: a touch on the WALL does not start a tilt.** This
   * is what keeps the tap working — a drag that claimed every touch would
   * swallow the click that pulls a record. A test that only exercises a touch on
   * the record cannot tell a correct boundary from one that claims everything.
   */
  it('does NOT start when the touch missed the record', () => {
    expect(shouldStartTiltDrag({ ...base, hitRecord: false })).toBe(false);
  });

  it('does not start when the record is not in a tilting phase', () => {
    // e.g. rising or returning — the record is in motion, not settled.
    expect(shouldStartTiltDrag({ ...base, canTilt: false })).toBe(false);
  });

  it('does not start under reduced motion (§10b: the turning is decorative)', () => {
    expect(shouldStartTiltDrag({ ...base, reducedMotion: true })).toBe(false);
  });
});

describe('the drag lifecycle holds the angle on release', () => {
  it('begins inactive-to-active with no angle yet', () => {
    const drag = beginDrag();
    expect(drag.active).toBe(true);
    expect(drag.tilt).toBeNull();
  });

  /**
   * **The hold rule (§10b), asserted directly.** A record turned to some angle
   * keeps it when the finger lifts. `endDrag` stops the drag and PRESERVES the
   * tilt — a version that reset to `NO_TILT` on release would pass a test that
   * only checked the angle moved during the drag, and spring the record home the
   * instant the finger left.
   */
  it('keeps the last tilt when the finger lifts', () => {
    const turned: Tilt = { rotateX: 8, rotateY: -12 };
    const dragging = { active: true, tilt: turned };

    const released = endDrag(dragging);

    expect(released.active, 'the drag has stopped').toBe(false);
    expect(released.tilt, 'the angle is held, not reset').toEqual(turned);
    expect(released.tilt).not.toEqual(NO_TILT);
  });

  it('NO_DRAG is inactive with no angle', () => {
    expect(NO_DRAG.active).toBe(false);
    expect(NO_DRAG.tilt).toBeNull();
  });
});


describe('swipeDirection — navigation vs tilt, decided geometrically', () => {
  const WIDTH = 320; // a phone record ~320px wide; half is 160.

  it('a long horizontal drag left is NEXT, right is PREVIOUS', () => {
    expect(swipeDirection({ dx: -200, dy: 10, recordWidth: WIDTH })).toBe('next');
    expect(swipeDirection({ dx: 200, dy: 10, recordWidth: WIDTH })).toBe('previous');
  });

  /**
   * **A tilt-sized drag is NOT a swipe.** A short horizontal drag — the kind a
   * tilt is — stays under half the record's width and returns null, so the tilt
   * keeps it. This is the discriminating case: a drag that produces a tilt must
   * not also navigate.
   */
  it('a short horizontal drag is a tilt, not a swipe', () => {
    expect(swipeDirection({ dx: 60, dy: 20, recordWidth: WIDTH })).toBeNull();
    expect(swipeDirection({ dx: -100, dy: 30, recordWidth: WIDTH })).toBeNull();
  });

  it('a mostly-vertical drag is never a swipe', () => {
    /* Even a long one — dragging down is not "next record". */
    expect(swipeDirection({ dx: 180, dy: 300, recordWidth: WIDTH })).toBeNull();
  });

  it('the threshold is half the record width, and scales with it', () => {
    /* Just under half of 320 is 160: 159 does not swipe, 161 does. */
    expect(swipeDirection({ dx: -159, dy: 0, recordWidth: WIDTH })).toBeNull();
    expect(swipeDirection({ dx: -161, dy: 0, recordWidth: WIDTH })).toBe('next');
    /* A wider record needs a longer swipe — hand-independent, geometry-bound. */
    expect(swipeDirection({ dx: -161, dy: 0, recordWidth: 600 })).toBeNull();
  });
});
