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
 * content track, with a 4px tolerance. The tolerance stays as a guard against
 * a coincidental pass, but no record is near it."
 *
 * A shortfall inside it is not a shortfall. The 0.4px margin that prompted
 * the rule was measured on a suffixed fixture; the real good case has about
 * 45px of slack, so the tolerance costs nothing and catches the case where a
 * record appears to fit by a rounding.
 */
export const COLLAPSE_TOLERANCE = 4;

export function shouldCollapse({ needed, available }: { needed: number; available: number }): boolean {
  return needed > available + COLLAPSE_TOLERANCE;
}
