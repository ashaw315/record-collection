import { describe, expect, it } from 'vitest';
import { WALL_DIM_FLOOR, WALL_DIM_FLOOR_DEEP, wallDim, wallDimTo } from './wall-dim';

/**
 * **The stronger dim exists to be compared against a blur, not to replace the
 * dim on its own merits.**
 *
 * Adam: *"if a stronger dim gets most of the effect I would rather not add a
 * composer to the scene at all"* — `EffectComposer` plus a render target plus a
 * custom pass plus resize handling, in a scene whose resize deliberately tracks
 * width only, is the largest addition of the session for a one-sentence effect.
 */
describe('the deep dim is a genuine alternative to a blur', () => {
  /**
   * **The deep floor IS the shipping floor now**, and this assertion used to say
   * it was darker. It was built as the cheap alternative to a blur and lost that
   * comparison — but it won the one that mattered for this constant, against the
   * 0.28 that was actually shipping. Adam: *"I rejected the deep dim as cheap
   * against a blur, which was the wrong comparison."*
   *
   * Kept as an alias rather than deleted so the harness comparison stays
   * reproducible and the history is legible at the constant.
   */
  it('is the shipping floor, having won that comparison', () => {
    expect(WALL_DIM_FLOOR_DEEP).toBe(WALL_DIM_FLOOR);
  });

  /**
   * **But not black.** `WALL_DIM_FLOOR`'s own reasoning bounds this: "not so
   * dark that the wall stops being the thing the record came out of — the empty
   * slot is what the whole rewrite was for, and a black rectangle behind the
   * cover loses it."
   */
  it('keeps enough light that the empty slot is still readable', () => {
    expect(WALL_DIM_FLOOR_DEEP).toBeGreaterThan(0.05);
  });

  it('reduces to the shipping curve when given the shipping floor', () => {
    for (let t = 0; t <= 1; t += 0.1) {
      expect(wallDimTo(t, WALL_DIM_FLOOR)).toBeCloseTo(wallDim(t), 10);
    }
  });

  /**
   * **Linear, like the dim it generalises.** The recorded reason a cubic
   * ease-out was rejected — 88% dimmed by halfway, so the wall goes dark ahead
   * of the record — applies to any floor, and this is where a future "make it
   * ease" edit gets caught.
   */
  it('tracks the rise linearly at any floor', () => {
    const halfway = wallDimTo(0.5, WALL_DIM_FLOOR_DEEP);
    const expected = 1 - (1 - WALL_DIM_FLOOR_DEEP) * 0.5;
    expect(halfway).toBeCloseTo(expected, 10);

    // 15% of the way dimmed at 15% progress — unit 11's requirement.
    const early = 1 - wallDimTo(0.15, WALL_DIM_FLOOR_DEEP);
    const total = 1 - WALL_DIM_FLOOR_DEEP;
    expect(early / total).toBeCloseTo(0.15, 6);
  });
});
