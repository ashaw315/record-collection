import { describe, expect, it } from 'vitest';
import { beginDrag, endDrag, shouldStartTiltDrag, NO_DRAG } from './touch-tilt';
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
