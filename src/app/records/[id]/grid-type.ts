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
