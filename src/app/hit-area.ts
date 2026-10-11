/**
 * **A control's hit area where its drawn box is under §9.3's 44.**
 *
 * The handoff: "§9.3's 44 is a hit-target floor for every control a finger
 * is expected to hit, not a property of the boxed control... Every unboxed
 * link the app expects a finger to hit meets it, by overlay where the drawn
 * link is smaller." And for how far it reaches sideways: "each reaches
 * halfway across the gap to its neighbour, and where there is no neighbour,
 * or the gap is wider than the set's own, it reaches a stated figure past
 * the thing itself and no further. Blank paper is never a tap target. The
 * figure is 9".
 *
 * The overlay is a pseudo-element, so it draws nothing and moves nothing.
 * It is positioned, which is what puts it above the text that follows the
 * control: padding on an inline link reaches as far and is covered by the
 * next line of type.
 *
 * `HIT` is the 44, centred on the control. A control takes it with one
 * `HIT_*` for each side, written out where it is used because the figure
 * is the neighbour's and Tailwind reads classes from the source as text.
 */
export const HIT = "relative before:absolute before:top-1/2 before:h-[44px] before:-translate-y-1/2 before:content-['']";
/** No neighbour on either side: 9 past the thing. */
export const HIT_ALONE = `${HIT} before:-left-[9px] before:-right-[9px]`;
