/**
 * The geometry behind §10b's rise: "the record rises out of its slot. It was on
 * the shelf a moment ago and now it is in your hands — that continuity is the
 * feature. A record that fades in centred is a modal wearing a sleeve, and the
 * difference is felt immediately."
 *
 * **This module holds arithmetic and no timing.** The duration lives in
 * `globals.css` and nothing here knows it — that separation is the point. Two
 * earlier attempts at the FLIP's sibling animation failed because React and the
 * compositor each held a copy of "how long" and disagreed about the midpoint;
 * the fix was to stop sharing the number rather than to synchronise it better.
 *
 * The rise is FLIP's Invert step (First, Last, Invert, Play):
 *
 *   1. First  — measure the spine before anything moves.
 *   2. Last   — render the record at its settled, centred position.
 *   3. Invert — apply the transform below, so it *starts* looking like the spine.
 *   4. Play   — remove the transform next frame; CSS carries it.
 *
 * Pure, because it is a decision about where the record comes from. A component
 * test would confirm whatever the component produced without ever saying what
 * it should be.
 */

/** The part of a `DOMRect` this needs. Narrowed so a test can pass a literal. */
export type Rect = { left: number; top: number; width: number; height: number };

export type RiseTransform = {
  translateX: number;
  translateY: number;
  scaleX: number;
  scaleY: number;
};

/**
 * No rise at all: the record simply appears where it settles.
 *
 * Used where there is no slot to come out of — a spine that was never measured
 * because activation came from the keyboard, and the reduced-motion reader,
 * whom §10b excuses from the motion but not from the record.
 */
export const NO_RISE: RiseTransform = { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 };

/**
 * Map the record's settled rect back onto the spine's, so it starts as the
 * spine and grows into the record.
 *
 * **Centre to centre, not corner to corner.** A CSS `transform` scales about
 * the element's own centre, so translating corner-to-corner leaves the record
 * offset by half the size difference — beside the slot rather than in it, and
 * worse the bigger the record. Measured against the real shelf that is ~250px
 * of error on a 512px sleeve, which reads as the record flying in from nowhere.
 *
 * **Two scales, not one.** A spine is a sliver: ~13px wide against a 512px
 * sleeve, but 160px tall against the same. Sharing one ratio would start the
 * record as a small square rather than as the shape of the thing on the shelf.
 *
 * A zero-sized target — `getBoundingClientRect` on an element that is not laid
 * out yet — would otherwise divide to `Infinity`, and a non-finite value in a
 * `transform` string voids the whole declaration silently: the record would
 * jump instead of rising, and nothing would throw to say so.
 */
export function riseTransform(spine: Rect, target: Rect): RiseTransform {
  const safeScale = (from: number, to: number) => (to === 0 ? 1 : from / to);

  return {
    translateX: spine.left + spine.width / 2 - (target.left + target.width / 2),
    translateY: spine.top + spine.height / 2 - (target.top + target.height / 2),
    scaleX: safeScale(spine.width, target.width),
    scaleY: safeScale(spine.height, target.height),
  };
}

/**
 * The transform as CSS writes it.
 *
 * Order matters: `translate` then `scale` means the translation is in
 * untransformed pixels, which is what the arithmetic above computes. Reversing
 * them would scale the translation too and land the record short of its slot.
 */
export function riseTransformCss({
  translateX,
  translateY,
  scaleX,
  scaleY,
}: RiseTransform): string {
  return `translate(${translateX}px, ${translateY}px) scale(${scaleX}, ${scaleY})`;
}
