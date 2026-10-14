/**
 * The detail screen's shared type and rule vocabulary (7a §3, §4).
 *
 * **One definition, not six.** The grid, `RecordDetail`, `ImageGallery`,
 * `PriceHistory`, `RecordJournal` and `SnippetPanel` all label their sections,
 * and six copies of a label style is the shape A61 records as the
 * fifteen-places defect: a treatment changed in one place and left stale in
 * fourteen, with nothing to say which was current.
 *
 * §4 specifies the label exactly — mono, uppercase, .09em tracking, one muted
 * ink — and the distinction between 11px labels and 13px body "is carried by
 * treatment" rather than by the 2px size step. That only holds if every label
 * has the same treatment.
 */

/**
 * The label's ink (§4, §W.4): `oklch(0.44 0.008 70)`, 6.2:1 on the drawing's
 * paper and 7.4:1 on the ground the page actually paints.
 *
 * **Was 0.55, which read 3.88:1 on the drawn paper, and survived because
 * contrast is checked against the ground a mark sits on — and these sat on the
 * default, which nobody checks.** The 10px meta lines carry the same ink by
 * name: a second literal is how the 0.55 would have outlived this change.
 *
 * The CSS value; `LABEL` spells the same value as a Tailwind arbitrary class,
 * because the scanner needs the literal in source to generate the utility.
 */
export const LABEL_INK = 'oklch(0.44 0.008 70)';

/** §4's field and section label: 11px mono, uppercase, tracked, one grey. */
export const LABEL = 'text-label font-mono uppercase tracking-[0.10em] text-[oklch(0.44_0.008_70)]';

/**
 * The label's type with no colour, for a label that is set in ink.
 *
 * `LABEL` and `INK` together are two colour classes on one element, and
 * which wins is the stylesheet's order and not the order they are written
 * in: the band's Add record carried both and drew in the label colour
 * (step 100). An element takes one colour class.
 */
export const LABEL_TYPE = 'text-label font-mono uppercase tracking-[0.10em]';

/** The ink everything on this screen is set in. */
export const INK = 'text-[oklch(0.19_0.008_60)]';

/**
 * §3's 1px internal rule — "hairlines separate things that are already
 * understood to be separate; they never rank".
 *
 * Distinct from the 6px structural weight, which makes a claim about what lies
 * on either side of it and must not be applied to a new edge without one.
 */
export const HAIRLINE = 'border-[oklch(0.19_0.008_60)]';
/**
 * §9.3's control, boxed: the label type in ink, a 1px square hairline box,
 * no fill, 44 tall, 18 of padding a side, underlined under a pointer. As
 * the error screen, the collection's and the shelf's empty controls, the
 * sleeve modal and the want list's LOOK UP A RECORD draw it (each with
 * its own copy of this string, which part 1 did not fold; step 145). A
 * §9.3 control as a label is the same type with no box.
 */
export const CONTROL_BOX = `${LABEL_TYPE} ${INK} box-border inline-flex h-[44px] items-center justify-center border ${HAIRLINE} px-[18px] decoration-1 underline-offset-[3px] hover:underline`;
export const CONTROL_LABEL = `${LABEL_TYPE} ${INK} inline-flex h-[44px] items-center decoration-1 underline-offset-[3px] hover:underline`;
