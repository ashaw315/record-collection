import { describe, expect, it } from 'vitest';
import { RESTING_ROTATION_Y, faceTowardCamera } from './spine-facing';

/**
 * Which face of a spine points at the viewer, and why the sign matters.
 *
 * **A wall rendered perfectly and showed no text at all.** Colour, lighting,
 * shelves, layout and the slot behaviour were all correct; the labels were
 * simply on the face pointing away. Nothing failed, nothing errored, and every
 * existing assertion stayed green — the defect was only visible by looking at a
 * wall with real data on it.
 *
 * The cause was a sign: after a rotation of +π/2 about Y it is the −x face that
 * points at the camera, not +x. The label was on +x.
 *
 * This is arithmetic, so it can be pinned rather than eyeballed — and it is
 * worth pinning because both plausible fixes (move the label, flip the sign)
 * look equally right in code and only one also leaves the COVER facing the
 * viewer when the turn completes.
 */

describe('faceTowardCamera', () => {
  it('reports +x at the resting rotation, which is where the label is', () => {
    /**
     * The property the wall depends on: a spine standing in the wall shows the
     * sleeve's edge, and that is the face the label is drawn on.
     *
     * Fails against `RESTING_ROTATION_Y` if its sign is flipped, which is
     * exactly the defect that shipped.
     */
    expect(faceTowardCamera(RESTING_ROTATION_Y)).toBe('+x');
  });

  it('reports +z when the turn completes, which is where the cover is', () => {
    /**
     * The other end of the same motion, and the reason the sign was chosen
     * rather than moving the label to −x. One sign has to serve both: edge
     * toward the viewer at rest, cover toward the viewer at face-on.
     *
     * Moving the label instead would have fixed the wall and left the record
     * showing its BACK when it finished turning — a defect that only appears
     * after a 620ms animation, which is the worst kind to find late.
     */
    expect(faceTowardCamera(0)).toBe('+z');
  });

  it('sweeps through the turn without the visible face ever being -x', () => {
    /**
     * Swept rather than checked at the ends. Unit 17's finding: two endpoint
     * assertions can both pass while a band between them collapses — and here
     * a mid-turn frame showing the wrong face would read as the record
     * flickering, which is the sort of thing the eye catches and a two-point
     * test does not.
     */
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) {
      const angle = RESTING_ROTATION_Y * (1 - i / steps);
      expect(faceTowardCamera(angle), `at step ${i} the wrong face is forward`).not.toBe('-x');
    }
  });

  it('would report the WRONG face for the opposite sign', () => {
    /**
     * The defect, asserted directly, so this file documents what went wrong
     * rather than only what is right. A reader changing the sign back sees a
     * test named after the consequence.
     */
    expect(faceTowardCamera(-RESTING_ROTATION_Y)).toBe('-x');
  });
});
