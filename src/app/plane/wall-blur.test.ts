import { describe, expect, it } from 'vitest';
import { WALL_BLUR_MAX_PX, wallBlurStep, wallBlurPx } from './wall-blur';

/**
 * **The wall goes OUT OF FOCUS behind a pulled record, not merely darker.**
 *
 * Adam, after the cheap alternative was tried and rejected: *"The cheap option
 * looks cheap. Darkening is not the effect — the wall goes dim rather than going
 * out of focus, and at 125 records the noise is still all there, just darker."*
 *
 * So this is a real screen-space blur, and it JOINS the dim rather than
 * replacing it: *"out of focus and slightly darker is what a real shallow depth
 * of field does."* The two are independent controls.
 */
describe('the blur tracks the rise', () => {
  /**
   * **Linear, for the reason `wallDim` is linear**, which was recorded when a
   * cubic ease-out was rejected for the dim: it is 88% of the way by halfway, so
   * the wall goes dark — here, out of focus — ahead of the record, and the
   * arrival happens against an already-blurred backdrop. That is the modal
   * opening this exists to avoid.
   */
  it('is 15% blurred at 15% of the rise', () => {
    expect(wallBlurPx(0.15) / WALL_BLUR_MAX_PX).toBeCloseTo(0.15, 6);
    expect(wallBlurPx(0.5) / WALL_BLUR_MAX_PX).toBeCloseTo(0.5, 6);
  });

  it('is sharp at rest and fully soft when the record is out', () => {
    expect(wallBlurPx(0)).toBe(0);
    expect(wallBlurPx(1)).toBe(WALL_BLUR_MAX_PX);
  });

  it('clamps outside 0..1 rather than blurring unboundedly', () => {
    expect(wallBlurPx(-1)).toBe(0);
    expect(wallBlurPx(2)).toBe(WALL_BLUR_MAX_PX);
  });

  /**
   * **A blur radius has to be expressed in TEXTURE units for the shader**, and
   * that conversion is where a resize silently breaks the effect: the same
   * pixel radius is a different fraction of a narrow canvas than a wide one.
   */
  it('converts pixels to a texture step against the canvas size', () => {
    expect(wallBlurStep({ px: 8, sizePx: 800 })).toBeCloseTo(0.01, 10);
    // Half the canvas, same radius: twice the step.
    expect(wallBlurStep({ px: 8, sizePx: 400 })).toBeCloseTo(0.02, 10);
  });

  it('never divides by a zero canvas dimension', () => {
    expect(wallBlurStep({ px: 8, sizePx: 0 })).toBe(0);
    expect(Number.isFinite(wallBlurStep({ px: 8, sizePx: 0 }))).toBe(true);
  });

  /**
   * The maximum is a look-at-it value, but it is bounded on both sides: a
   * blur under a pixel or two is indistinguishable from none — the failure the
   * DIM had, arrived at from the other direction — and a very large one costs
   * fragment work for an effect nobody asked to be dramatic.
   */
  it('states a maximum radius that is visible but not extravagant', () => {
    expect(WALL_BLUR_MAX_PX).toBeGreaterThan(3);
    expect(WALL_BLUR_MAX_PX).toBeLessThan(40);
  });
});
