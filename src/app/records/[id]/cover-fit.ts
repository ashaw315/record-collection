/**
 * §33 (step 83): "The cover is cropped to fill its square where the
 * photograph's shorter side is at least 95% of its longer, and fitted in the
 * square on paper beyond that."
 *
 * Every cover was cropped to fill, which costs a near-square scan a sliver
 * (Believer, 581 x 600, shows 96.8%) and would cost a 4:3 phone photograph a
 * quarter of itself. Within the bound the crop stands, so no cover in the
 * collection changes; beyond it the photograph is kept whole.
 *
 * Pure, because the rule is the decision: which side of 95% a photograph
 * falls on, and that the comparison is shorter against longer, not width
 * against height.
 */
export const COVER_CROP_BOUND = 0.95;

export type CoverTreatment = 'crop' | 'fit';

export function coverTreatment(width: number, height: number): CoverTreatment {
  /* Not yet loaded, or unreadable: the built treatment stands. */
  if (!(width > 0) || !(height > 0)) return 'crop';
  const shorter = Math.min(width, height);
  const longer = Math.max(width, height);
  /* Integers on both sides, so "at least 95%" at exactly 950 x 1000 does not hang on a rounded quotient. */
  return shorter * 100 >= longer * (COVER_CROP_BOUND * 100) ? 'crop' : 'fit';
}
