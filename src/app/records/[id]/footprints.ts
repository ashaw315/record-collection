/**
 * The construction's footprints: three per form, offset from its top face.
 *
 * **One source, because two consumers need the same offset.** `ConstructionStill`
 * draws them; `own-fit` must know how far they reach so the box it fits
 * contains them. Kept in two places, the box was fitted to the faces alone and
 * the broadest footprint fell outside it -- the outer svg clips to its viewBox,
 * so the shadow was cut, and §5.1 reads a cropped object as "something went
 * wrong". §31's 16-unit pad hid it; step 29(g) removed the pad and it
 * surfaced as the drawing's bottom edge 1.65px past its cell at 2000.
 */

/** Tight-and-dark to broad-and-faint. `offset` is in the plan's units. */
export const SHADOW_STEPS = [
  { offset: 3, opacity: 0.2 },
  { offset: 9, opacity: 0.09 },
  { offset: 18, opacity: 0.05 },
] as const;

/** The broadest footprint's offset -- how far past a face any footprint reaches. */
export const FOOTPRINT_REACH = Math.max(...SHADOW_STEPS.map((s) => s.offset));

/** A face's points shifted by one footprint's offset, light from upper-left. */
export function footprintPoints(
  points: ReadonlyArray<readonly [number, number]>,
  offset: number,
): Array<readonly [number, number]> {
  return points.map(([x, y]) => [x + offset * 0.8, y + offset] as const);
}
