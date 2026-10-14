import { describe, expect, it } from 'vitest';
import { gapBetween } from '../../e2e/pair-gap';

/**
 * **A pair's gap is read along the axis that separates it, not along an
 * axis the test assumed** (the coordinator, 13 Oct, step 143). Design's 24
 * is "side by side or stacked", and which of the two a pair is at 390 is
 * not yet known for every pair, so a test asserting a horizontal 24 would
 * read a stacking pair as a gap defect when the gap is fine and the layout
 * differs from the guess. This finds the axis from the two boxes and
 * returns the gap along it, and the spec asserts 24 on whatever it found.
 *
 * Fails against a reader that assumes x, one that returns the larger of
 * the two separations, one that reads two touching boxes as overlapping,
 * and one whose answer depends on which box is named first.
 */
describe('gapBetween', () => {
  const box = (left: number, top: number, width: number, height: number) => ({ left, top, right: left + width, bottom: top + height });

  it('reads two boxes side by side as x apart, by the space between their facing edges', () => {
    expect(gapBetween(box(18, 100, 96, 44), box(138, 100, 102, 44))).toEqual({ axis: 'x', gap: 24 });
  });

  it('reads two boxes stacked as y apart, even where they overlap in x', () => {
    expect(gapBetween(box(18, 100, 96, 44), box(18, 168, 102, 44))).toEqual({ axis: 'y', gap: 24 });
    expect(gapBetween(box(18, 100, 96, 44), box(60, 152, 102, 44)), 'a stacked pair whose left edges differ is still stacked').toEqual({ axis: 'y', gap: 8 });
  });

  it('gives the same answer whichever box is named first', () => {
    expect(gapBetween(box(138, 100, 102, 44), box(18, 100, 96, 44))).toEqual({ axis: 'x', gap: 24 });
    expect(gapBetween(box(18, 168, 102, 44), box(18, 100, 96, 44))).toEqual({ axis: 'y', gap: 24 });
  });

  it('reads touching boxes as 0 apart on their axis, and overlapping boxes as on no axis', () => {
    expect(gapBetween(box(0, 0, 10, 10), box(10, 0, 10, 10))).toEqual({ axis: 'x', gap: 0 });
    expect(gapBetween(box(0, 0, 10, 10), box(5, 5, 10, 10))).toEqual({ axis: 'none', gap: 0 });
  });

  it('reads boxes apart on both axes as diagonal, with the shorter separation', () => {
    expect(gapBetween(box(0, 0, 10, 10), box(30, 50, 10, 10))).toEqual({ axis: 'both', gap: 20 });
  });

  it('rounds away sub-pixel noise so a 24 laid out at 23.996 reads as 24', () => {
    expect(gapBetween(box(18, 100, 96, 44), { left: 137.996, top: 100, right: 240, bottom: 144 })).toEqual({ axis: 'x', gap: 24 });
  });
});
