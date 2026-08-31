/**
 * How dark the wall goes behind a pulled record.
 *
 * **The dim lives in the scene, not in a DOM overlay, and that is a correction
 * rather than a preference.** Measured: a `black/70` scrim cost the cover 0.30x
 * its brightness — exactly `1 - 0.7` — because it sat above the canvas in
 * z-order and dimmed the record along with the wall. The panels looked
 * full-strength because they are siblings above the scrim; the record looked
 * washed because the canvas is below it.
 *
 * §10b: a cover is a claim about a record's artwork, and rendering it at 44% of
 * the sleeve's brightness is the app being wrong about the record — the same
 * class as inventing a spine colour. So the wall dims and the record does not,
 * which is only expressible where they are separate objects.
 *
 * **Unit 11's ordering survives the move.** The backdrop arrives AS the record
 * travels — partway at 15%, not before — and that is what makes the rise read
 * as arriving rather than a modal opening. The DOM scrim was a step function
 * smoothed by a CSS transition; in the scene there is no transition, so the
 * curve has to be real.
 */

/**
 * How much light the wall keeps at full dim.
 *
 * Dark enough that the record is plainly the subject; not so dark that the wall
 * stops being the thing the record came out of — the empty slot is what the
 * whole rewrite was for, and a black rectangle behind the cover loses it.
 *
 * **0.1, down from 0.28, chosen by looking at both on `/scene`.** The deeper
 * floor was first built as the cheap alternative to a blur and rejected in that
 * comparison — Adam: *"The cheap option looks cheap."* But that was the wrong
 * comparison for this constant. Against the SHIPPING 0.28 rather than against a
 * blur, the deeper floor is plainly better, and if the blur lands the two
 * compose rather than competing.
 *
 * Measured with a record out: wall mean luminance 54.0 at 0.28, 42.1 at 0.1,
 * with the brightest spine pixel unchanged at 235 — the record's own brightness
 * is untouched by `wallDimExempt`.
 */
export const WALL_DIM_FLOOR = 0.1;

/**
 * The wall's brightness multiplier at a given point in the rise.
 *
 * **Linear, and the curve was chosen by checking it against unit 11's
 * requirement rather than by picking a familiar easing.** A cubic ease-out —
 * the first attempt, and the same shape the rise itself uses — is 39% dimmed at
 * 15% progress and 88% by halfway: the wall goes dark well ahead of the record
 * and the arrival happens against an already-black backdrop, which is the modal
 * opening this exists to avoid.
 *
 * Linear tracks the rise's progress exactly, so the dim arrives WITH the record
 * rather than before it. That is what "the backdrop arrives as the record
 * travels" means, and it is measurable: 15% of the way dimmed at 15% progress.
 */
export function wallDim(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));

  return 1 - (1 - WALL_DIM_FLOOR) * t;
}

/**
 * **Retained as an alias, because the deep floor IS the shipping floor now.**
 *
 * It was built as the cheap alternative to a blur and compared against 0.28 on
 * `/scene`; the comparison it lost was against a blur, and the one it won was
 * against the value that was shipping. The harness switch keeps both entries so
 * the comparison stays reproducible, and they now name the same number.
 */
export const WALL_DIM_FLOOR_DEEP = WALL_DIM_FLOOR;

/**
 * The wall's brightness at a given rise progress, at a chosen floor.
 *
 * Linear for the same reason `wallDim` is, and that reason is worth keeping in
 * one place: a cubic ease-out is 88% dimmed by halfway, so the wall goes dark
 * ahead of the record and the arrival happens against an already-black backdrop
 * — the modal opening this exists to avoid.
 */
export function wallDimTo(progress: number, floor: number): number {
  const t = Math.min(1, Math.max(0, progress));

  return 1 - (1 - floor) * t;
}
