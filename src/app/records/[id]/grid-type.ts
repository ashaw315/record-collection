/**
 * The detail screen's shared type and rule vocabulary (7a §3, §4).
 *
 * **One definition, not six.** The grid, `RecordDetail`, `ImageGallery`,
 * `PriceHistory`, `RecordJournal` and `SnippetPanel` all label their sections,
 * and six copies of a label style is the shape A61 records as the
 * fifteen-places defect: a treatment changed in one place and left stale in
 * fourteen, with nothing to say which was current.
 *
 * §4 specifies the label exactly — mono, uppercase, .09em tracking,
 * `oklch(0.55 0.008 60)` — and the distinction between 11px labels and 13px
 * body "is carried by treatment" rather than by the 2px size step. That only
 * holds if every label has the same treatment.
 */

/** §4's field and section label: 11px mono, uppercase, tracked, one grey. */
export const LABEL = 'text-label font-mono uppercase tracking-[0.09em] text-[oklch(0.55_0.008_60)]';

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
