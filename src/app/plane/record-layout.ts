import { FACTS_PANEL_WIDTH, ACTIONS_PANEL_WIDTH } from './panel-dimensions';

/**
 * **Where the pulled record's facts sit — beside it, or beneath it (§10b, A32).**
 *
 * The record's presentation depends on the width available, not on a screen-size
 * label. §10b flanks the record with two panels; below a width there is no room
 * for a panel at a readable size without crushing the record, so the record goes
 * full-bleed and the facts move to a summary card stacked beneath it.
 *
 * The threshold is a MEASUREMENT (A32): a record reads as an object down to
 * roughly its phone size, and two panels plus gaps plus page margins around a
 * record that size need about 820px. Below that the flanked record would be a
 * stamp between the panels.
 */

/**
 * The smallest a record may be and still read as an object rather than an icon.
 *
 * Its phone size, which step 15 unit 4 judged as "reads as the thing I pulled
 * out". Used as the floor the flanking layout must not push the record below.
 */
export const READABLE_RECORD_MIN = 320;

/** The gap between the record and each flanking panel, and the page's own margin. */
export const PANEL_GAP = 24;
export const PAGE_MARGIN = 48;

/**
 * **The width at or above which the flanking panel fits (A32).**
 *
 * Derived, not chosen: facts panel + gap + a readable record + gap + controls
 * panel + page margin. It lands near 820px, which is between Tailwind's `md`
 * (768) and `lg` (1024) and coincides with neither — so it is used as the
 * measured value rather than snapped to a breakpoint that means a different
 * thing.
 *
 * Rounded UP from the bare sum, because the sum is the point at which the record
 * hits its readable floor exactly, and a layout that only just fits reads as
 * cramped. The headroom is what makes the flanking layout look deliberate rather
 * than squeezed.
 */
export const FLANKING_MIN_WIDTH = 820;

/**
 * A check on the constant above, called by the test rather than at runtime: the
 * threshold must actually leave the record its readable minimum once both panels
 * and the margins are subtracted.
 */
export function recordWidthWhenFlanked(viewportWidth: number): number {
  return (
    viewportWidth - FACTS_PANEL_WIDTH - ACTIONS_PANEL_WIDTH - 2 * PANEL_GAP - PAGE_MARGIN
  );
}

/** Which layout a viewport gets. Pure, so the fork is one testable decision. */
export function recordLayout(viewportWidth: number): 'flanked' | 'stacked' {
  return viewportWidth >= FLANKING_MIN_WIDTH ? 'flanked' : 'stacked';
}
