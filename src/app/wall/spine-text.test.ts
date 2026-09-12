import { describe, expect, it } from 'vitest';
import { GLYPH_ADVANCE_PX, GLYPH_RUN_PX, SPINE_TEXT_BUDGET } from './spine-text';

/**
 * **This constant went through four values, and the only one that holds is the
 * one where every term is named.** So the test asserts the DERIVATION and not
 * the answer: a bare `expect(SPINE_TEXT_BUDGET).toBe(37)` would pass for a 37
 * that someone fitted to a screenshot, which is how the previous three values
 * got in. Each term is pinned separately, and the budget is checked to be what
 * they produce.
 */
describe('the spine text budget is derived, not fitted', () => {
  it('names the glyph run as 232px less the 8px baseline inset', () => {
    expect(GLYPH_RUN_PX).toBe(224);
  });

  it('names the per-character advance', () => {
    expect(GLYPH_ADVANCE_PX).toBeCloseTo(6.235, 3);
  });

  it('is floor(232 / 6.235) = 37', () => {
    /*
      The divisor is applied to the full 232, not to the 224 run — that is the
      arithmetic Design confirmed, and writing it out is the point: a future
      reader who divides by GLYPH_RUN_PX gets 35 and will think this is wrong.
    */
    expect(Math.floor(232 / GLYPH_ADVANCE_PX)).toBe(SPINE_TEXT_BUDGET);
    expect(SPINE_TEXT_BUDGET).toBe(37);
  });

  it('leaves 1.3px of margin at the longest label and overruns at 38', () => {
    // The whole of the slack, stated so that a change to the advance fails here
    // rather than silently clipping the last character on the longest label.
    const longest = SPINE_TEXT_BUDGET * GLYPH_ADVANCE_PX;
    expect(longest).toBeCloseTo(230.695, 3);
    expect(232 - longest).toBeCloseTo(1.305, 3);

    expect((SPINE_TEXT_BUDGET + 1) * GLYPH_ADVANCE_PX).toBeGreaterThan(232);
  });
});
