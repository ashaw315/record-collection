/**
 * §4.2 — the genres run, and when it collapses.
 *
 * **Three things give, in order, and this is the third.** The title→pressing
 * gap absorbs first (43.1px at two title lines), then the corner ornament
 * track (down to zero), and only then the genres run — the frame's least
 * specific line, true of the work rather than of this pressing, so the only
 * line whose collapse withholds no distinguishing information. Collapsing it
 * frees the run's 28.5px against the shortfall.
 *
 * What replaces it is a count on the format line: `Vinyl, LP, Album · 3
 * genres`, underlined, opening the pressing editor. It costs no height because
 * it appends to a line already set — a second line would cost back what the
 * collapse just recovered.
 *
 * **The threshold is a CONDITION, not a line count**: the run collapses when
 * the ornament track has resolved to 0 and the remaining growth still exceeds
 * the gap. "Five lines" was a proxy for it — the granularity defect arriving in
 * §4.2 — and a proxy fires wrongly the moment the type stack or the measure
 * moves, which is what happened: the drawing's give arithmetic (183.1 against
 * 203.1, 20px short) was computed against a stack ~69px taller than the built
 * one. A text stack's height is a measurement, not a decision, and the build is
 * authoritative on it. Under the condition, no record in the collection
 * collapses today — the longest title leaves the track 27px — and the mechanism
 * stays specified for when one does.
 */

export type Genre = { id: string; name: string };

/**
 * The run in one of its two states.
 *
 * **`hidden` is the number withheld, by subtraction from what is shown** — never
 * `genres.length` read directly. A count that says three when three are visible
 * is the defect this vocabulary exists to prevent: it tells the reader a fact
 * is withheld when it is on the page. Full collapse hides them all, so the two
 * agree; the invariant is that they agree because nothing is shown.
 */
export function genresRun(
  genres: readonly Genre[],
  collapsed: boolean,
): { shown: Genre[]; hidden: number } {
  const shown = collapsed ? [] : [...genres];

  return { shown, hidden: genres.length - shown.length };
}

/**
 * Whether the run collapses: only when the content still does not fit with the
 * track already at zero.
 *
 * **The condition, as a shortfall.** `needed` is the content track's full
 * height with the run shown; `available` is the cell's inner height, which is
 * what the content has once the track has resolved to 0. `needed > available`
 * is exactly "the remaining growth still exceeds the gap" — a title of any line
 * count that fits does not collapse, and one of any line count that overflows
 * does.
 */
/**
 * §28's tolerance on the trigger: "The trigger measures the cell, not the
 * content track, with a 4px tolerance. **The tolerance stays as a guard
 * against a coincidental pass**, but no record is near it."
 *
 * **It makes the collapse fire MORE readily, not less, and the direction is
 * the whole point.** A record that clears the cell by a hair is not really
 * fitting — the 0.4px margin that prompted the rule was a rounding on a
 * suffixed fixture — so anything inside the tolerance yields its run. The
 * real good case has about 45px of slack and is untouched.
 *
 * Applied the other way, as slack BEFORE the collapse fires, it suppressed
 * the collapse on the collection's worst title at 2px over and the genres
 * run clipped by 0.9px instead of yielding. That inverts §27 — "if the worst
 * title still overflows, §4.2's genres-collapse fires — never
 * overflow-hidden" — and makes the tolerance the defect rather than the
 * guard.
 */
export const COLLAPSE_TOLERANCE = 4;

export function shouldCollapse({
  needed,
  available,
  fixedHeight = true,
}: {
  needed: number;
  available: number;
  /**
   * Whether the cell's height is the band's or its content's.
   *
   * §28: "Below 480 the band has no fixed height at all, **so there the
   * height give order does not apply**." The build's single-column fork sets
   * `height: auto` from 1440 down rather than from 480, so between those
   * widths the identity cell shrink-wraps and demand equals supply exactly —
   * measured at 1280, available 351 against a children's sum of 351. Any
   * tolerance then collapses every record.
   *
   * A cell that grows to its content cannot overflow, so there is nothing
   * for the give order to protect against. Defaults to the fixed band, so a
   * caller that does not say still gets the guard.
   */
  fixedHeight?: boolean;
}): boolean {
  if (!fixedHeight) return false;
  return needed > available - COLLAPSE_TOLERANCE;
}

/**
 * What the content actually needs, as distinct from the height its track was
 * stretched to.
 *
 * **§28 removed the identity cell's ornament track, leaving one track that
 * stretches to the cell** — so `scrollHeight` on it reports the cell's inner
 * height on every record, and the trigger could not tell a record with 45px
 * of slack from one 2px over. It was invisible while the tolerance was
 * applied as slack (nothing collapsed, including the record that should
 * have); flipping the tolerance to §28's ruled direction made every record
 * collapse, which is what surfaced it.
 *
 * The content's own height is the sum of its children's outer heights. A
 * stretched track does not change that, and §28's "the trigger measures the
 * cell, not the content track" is exactly this distinction: the cell is the
 * budget, the content's own height is the demand.
 *
 * It takes only the children, deliberately. A first version also took the
 * track's `scrollHeight` and returned the larger of the two, which read as
 * defensive and was not: for a stretched track the children's sum is always
 * the larger, and for an overflowing one `scrollHeight` equals the children's
 * sum, so the second term could never win. The extra parameter made the
 * function look like it handled two cases while computing one.
 */
export function contentHeight({
  childHeights,
}: {
  /** Each child's outer height, margins included. */
  childHeights: readonly number[];
}): number {
  return childHeights.reduce((sum, height) => sum + height, 0);
}
