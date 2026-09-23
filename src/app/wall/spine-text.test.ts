import { describe, expect, it } from 'vitest';
import { BASELINE_INSET_PX, END_INSET_PX, GLYPH_ADVANCE_PX, GLYPH_RUN_PX, SPINE_TEXT_BUDGET } from './spine-text';
import { SPINE_HEIGHT } from './geometry';

/**
 * **This constant went through four values, and the only one that holds is the
 * one where every term is named.** So the test asserts the DERIVATION and not
 * the answer: a bare `expect(SPINE_TEXT_BUDGET).toBe(37)` would pass for a 37
 * that someone fitted to a screenshot, which is how the previous three values
 * got in. Each term is pinned separately, and the budget is checked to be what
 * they produce.
 */
/**
 * The character budget, derived rather than declared (SPEC.md §10b; 8a §W.6,
 * §W.11). Every term is named so the next change to the face or the insets
 * produces a new derivation rather than a new fit: the face, less the
 * baseline inset and the end inset, over the measured advance.
 *
 * §W.11 draws the near view at true 1:1 with a 150-unit face and measures
 * its labels there — floor((150 − 14) / 6.235) = 21 — so the budget is the
 * drawing's. At 5b's 240 the same rule gives 36; the earlier 37 used the
 * baseline inset alone, which is the difference between the two, not a
 * second rule.
 */
describe('the budget derives from the face (§W.11)', () => {
  it('names the glyph run as the face less the baseline and end insets', () => {
    expect(BASELINE_INSET_PX).toBe(8);
    expect(END_INSET_PX).toBe(6);
    expect(GLYPH_RUN_PX).toBe(SPINE_HEIGHT - 14);
    expect(GLYPH_RUN_PX).toBe(136);
  });

  it('is floor(136 / 6.235) = 21', () => {
    expect(SPINE_TEXT_BUDGET).toBe(Math.floor(GLYPH_RUN_PX / GLYPH_ADVANCE_PX));
    expect(SPINE_TEXT_BUDGET).toBe(21);
  });

  it('leaves 5px of margin at the longest label and overruns at 22', () => {
    const longest = SPINE_TEXT_BUDGET * GLYPH_ADVANCE_PX;
    expect(GLYPH_RUN_PX - longest).toBeCloseTo(5.07, 1);
    expect((SPINE_TEXT_BUDGET + 1) * GLYPH_ADVANCE_PX).toBeGreaterThan(GLYPH_RUN_PX);
  });

  it('would move with the face: the same rule at 240 gives 36, not a second number', () => {
    expect(Math.floor((240 - BASELINE_INSET_PX - END_INSET_PX) / GLYPH_ADVANCE_PX)).toBe(36);
  });
});
