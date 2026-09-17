import { describe, expect, it } from 'vitest';
import { SHELF_INSET_Y, SLIDE } from './geometry';
import { slideY } from './pull-geometry';
import { pullPose, returnPose } from './pull-curve';

/**
 * D2: the pulled record slides forward along the depth axis rather than being
 * scaled in place. It stays the same isometric object — same three faces, same
 * projection — and moves by SLIDE along y on the pull's one eased value, so
 * colour (pull-colour) and position read the same curve.
 */
describe('the slide', () => {
  it('is seated at 0 and a full ledge forward at 1', () => {
    expect(slideY(pullPose(0, 1, 1))).toBe(SHELF_INSET_Y);
    expect(slideY(pullPose(1, 1, 1))).toBe(SHELF_INSET_Y + SLIDE);
  });

  it('rides the eased value — 87.5% of the way at halfway', () => {
    expect(slideY(pullPose(0.5, 1, 1))).toBeCloseTo(SHELF_INSET_Y + SLIDE * 0.875, 6);
  });

  it('returns on the return pose, ending seated', () => {
    expect(slideY(returnPose(1, 1, 1))).toBe(SHELF_INSET_Y);
    expect(slideY(returnPose(0, 1, 1))).toBe(SHELF_INSET_Y + SLIDE);
  });
});
