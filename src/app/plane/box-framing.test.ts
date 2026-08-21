import { describe, expect, it } from 'vitest';
import { boxCameraDistance } from './box-framing';

/**
 * The box camera distance, which decides how much of the frame the record
 * fills. The defect this fixes is a "100%" element rendering a 55% record
 * because the camera never moved (NOTES).
 */
describe('boxCameraDistance', () => {
  const FOV = 30;

  it('reproduces the default 3.4 that frames the record at ~55%', () => {
    /*
      The value `BoxCanvas` hard-coded, recovered from the fill it produces —
      so a change to the default framing has to move this number rather than
      passing silently.
    */
    expect(boxCameraDistance(0.55, FOV)).toBeCloseTo(3.39, 1);
  });

  it('stands the camera closer as the record fills more of the frame', () => {
    const far = boxCameraDistance(0.9, FOV);
    const near = boxCameraDistance(1, FOV);

    expect(near).toBeLessThan(far);
    expect(boxCameraDistance(1, FOV)).toBeCloseTo(1.87, 1);
  });

  /**
   * **The record fills EXACTLY the requested fraction at that distance**, which
   * is the property the comparison depends on: the element's width and the
   * record's width become one number rather than two that must agree.
   *
   * Fails against the old fixed distance, which fills 55% whatever is asked.
   */
  it('places the camera so the 1-unit record fills the fraction asked for', () => {
    for (const fill of [0.55, 0.9, 0.95, 1]) {
      const d = boxCameraDistance(fill, FOV);
      const frameHeight = 2 * d * Math.tan((FOV * Math.PI) / 360);
      expect(1 / frameHeight, `fill ${fill}`).toBeCloseTo(fill, 5);
    }
  });

  it('does not divide by zero on a degenerate fraction', () => {
    expect(Number.isFinite(boxCameraDistance(0, FOV))).toBe(true);
  });
});
