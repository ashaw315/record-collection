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
 * **On the build's geometry the third give is never reached by any record in
 * the collection.** The longest title — five lines — is absorbed by the
 * ornament track with 27px to spare at every viewport, because the title block
 * is a fixed 412px measure. The drawing's "20px short" is the build's surplus.
 * The mechanism is built to the rule, not to the drawing's arithmetic, and it
 * fires on a record whose facts run one line longer.
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
 * **Decided by the shortfall, not by a line count.** A five-line title that fits
 * does not collapse and a four-line title that overflows would. `needed` is the
 * content track's full height with the run shown; `available` is the cell's
 * inner height, which is what the content has once the ornament has given
 * everything.
 */
export function shouldCollapse({ needed, available }: { needed: number; available: number }): boolean {
  return needed > available;
}
