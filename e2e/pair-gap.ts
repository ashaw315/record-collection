/**
 * **The gap between two controls, read along the axis that separates
 * them** (step 143; the coordinator, 13 Oct). Design's 24 between grouped
 * controls is "side by side or stacked", and which a pair is at a given
 * width is the build's to show, not a test's to assume: a test that asserts
 * a horizontal 24 reads a stacking pair as a gap defect. So the axis is
 * found from the boxes and the gap is measured along it; a spec asserts 24
 * on whatever axis it found and reports which, which is also the answer to
 * Design's "where do pairs stack".
 *
 * `x`: apart left to right, overlapping top to bottom. `y`: the reverse.
 * `both`: apart on both axes, a diagonal, with the shorter separation.
 * `none`: the boxes overlap. The separation is rounded to a hundredth, so
 * a 24 laid out at 23.996 reads as 24.
 */
export type Box = { left: number; top: number; right: number; bottom: number };
export type PairGap = { axis: 'x' | 'y' | 'both' | 'none'; gap: number };

export function gapBetween(a: Box, b: Box): PairGap {
  const tidy = (v: number) => Math.round(v * 100) / 100;
  const dx = tidy(Math.max(b.left - a.right, a.left - b.right));
  const dy = tidy(Math.max(b.top - a.bottom, a.top - b.bottom));
  if (dx >= 0 && dy >= 0) return { axis: 'both', gap: Math.min(dx, dy) };
  if (dx >= 0) return { axis: 'x', gap: dx };
  if (dy >= 0) return { axis: 'y', gap: dy };
  return { axis: 'none', gap: 0 };
}
