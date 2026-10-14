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
 * **Only where the pointer is coarse** (§T.6, step 127): "The 44 floor
 * applies where the pointer is coarse, a finger on a phone, a tablet or a
 * touchscreen; where the primary pointer is fine, controls keep their
 * drawn size." The overlay is not displayed until the pointer is coarse,
 * and that one condition is the whole of it: the placing classes need
 * none. (Not by its `content`: Tailwind gives every `before:` class a
 * content of its own, so a condition there left the overlay in place
 * under a mouse, found by the test.) It is not only tidiness: stats' rows
 * are 27.5 apart under a mouse, and an overlay of 44 there would take the
 * lower edge of the name above.
 *
 * `HIT` is the 44, centred on the control. A control takes it with one
 * `HIT_*` for each side, written out where it is used because the figure
 * is the neighbour's and Tailwind reads classes from the source as text.
 */
export const HIT = "relative before:absolute before:top-1/2 before:h-[44px] before:-translate-y-1/2 before:hidden before:content-[''] pointer-coarse:before:block";
/**
 * For a link in a row that is itself the 44 (stats): the overlay is taller
 * than any row and the row cuts it (`ROW_CUTS`), so the link's hit area is
 * the row's height exactly, over the link's own width. An overlay of 44
 * centred on the name is not that: the name does not stand at the row's
 * exact middle, and the overlay took the first pixel of the row beneath
 * (a branch's row read 43 where a long name above it reached its middle;
 * stats at 320, step 127).
 */
export const HIT_ROW = "relative before:absolute before:inset-x-0 before:top-1/2 before:hidden before:h-[88px] before:-translate-y-1/2 before:content-[''] pointer-coarse:before:block";
export const ROW_CUTS = 'pointer-coarse:overflow-y-clip';
/**
 * For a link ALONE on its row (step 138, Design, 12 Oct): "Where a control
 * is alone on its row, the row is its target: a press anywhere along the
 * row acts as a press on the control. That is what a list row does, it
 * needs nothing drawn differently." The row takes `ROW_TARGET` and the link
 * `HIT_WHOLE_ROW`: the link is not positioned, so its overlay is placed
 * against the row and is the row's box. Coarse only, as every overlay is.
 * Not for a row with a second control in it: that is `HIT_ROW_LESS_44`.
 */
export const ROW_TARGET = 'relative';
export const HIT_WHOLE_ROW = "before:absolute before:inset-0 before:hidden before:content-[''] pointer-coarse:before:block";
/**
 * For a name on a row whose right 44 is a disclosure column (step 141,
 * Design, 12 Oct): "the disclosure takes the row's right 44 and the name
 * takes the rest of the row, so each meets the floor by its share of the
 * row." The name's overlay is the row less its right 44; what is under that
 * 44 is the row's own control (on stats, the `summary` that opens a branch)
 * or, since step 143, the empty column every genre row keeps: "the name's
 * target is the row less the disclosure column, with the count inside it".
 * The row takes `ROW_TARGET`. Coarse only.
 */
export const HIT_ROW_LESS_44 = "before:absolute before:inset-y-0 before:left-0 before:right-[44px] before:hidden before:content-[''] pointer-coarse:before:block";
/** No neighbour on either side: 9 past the thing. */
export const HIT_ALONE = `${HIT} before:-left-[9px] before:-right-[9px]`;
