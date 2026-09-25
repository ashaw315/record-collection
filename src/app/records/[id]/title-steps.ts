/**
 * §33's display ladder for the identity cell.
 *
 * **"Each cell of the upper band fits the record in front of it."** The cell
 * was sized for the collection's extreme — the five-line title — so an
 * ordinary record set its title at 72 in a cell built for five lines of it and
 * the band read thin. §33: "the returned space becomes type, not gap".
 *
 * The steps are a constant set, which is what keeps §5.1 satisfied: "The steps
 * are a constant set, so the scale is still the constant; which step a record
 * takes is layout."
 */

/** §33: "The steps are 72, 96, 120 and 144". Largest first — the rule is "the largest step that fits". */
export const TITLE_STEPS = [144, 120, 96, 72] as const;

/** §33: "the artist line is five-ninths of the title". */
export const ARTIST_OF_TITLE = 5 / 9;

/** §33: the demand is measured "with 24px of gap", and the gap is a floor. */
export const STEP_GAP = 24;

/**
 * §33, amended: "set in at most three lines. Height is the constraint the
 * band exists for; the line count is a legibility ceiling, not a preference."
 *
 * **Three, not two.** The two-line rule is withdrawn within §33
 * (33/two-line-ladder): it "maximised type subject to a line count and
 * minimised nothing", so a three-line title fell to 72 at every step and kept
 * 167px of slack -- the most of any record. Under this rule Loss Of Life is
 * expected at 144 in three lines, which Code had measured as fitting on
 * height and refused on line count alone.
 */
export const MAX_LINES = 3;

/**
 * The artist line for a title step — derived, then rounded to the nearest 2px.
 *
 * §33 gives both the rule and its four results (40, 54, 66, 80). Computing it
 * rather than tabulating means a fifth step could be added to `TITLE_STEPS`
 * without a second list to keep in agreement; the test checks the derivation
 * against all four stated values.
 */
export function artistStep(title: number): number {
  return Math.round((title * ARTIST_OF_TITLE) / 2) * 2;
}

/**
 * The largest step at which the title sets in at most two lines AND the cell's
 * demand, plus the gap, is within its supply.
 *
 * **Both conditions, not either.** §33 states them together, and they fail
 * differently: a long title breaks the line count at a large step, while a
 * tall stack of pressing facts breaks the supply even when the title is short.
 * Checking only lines would step a record up into a cell that cannot hold what
 * is below it.
 *
 * `linesAt` and `demandAt` are passed in because both are MEASUREMENTS — how
 * many lines a string sets to at a size, and how tall the cell's content then
 * is. Computing them from a character count here would be the declared-value
 * defect: the answer depends on the font, which only the browser knows.
 */
export function titleStep({
  linesAt,
  demandAt,
  supply,
}: {
  linesAt: (step: number) => number;
  demandAt: (step: number) => number;
  supply: number;
}): number {
  for (const step of TITLE_STEPS) {
    if (linesAt(step) > MAX_LINES) continue;
    if (demandAt(step) + STEP_GAP > supply) continue;
    return step;
  }
  /*
    §33: "If 72 does not fit, §4.2's give order runs as now." The smallest step
    is the floor rather than a failure — the give order handles what happens
    below it, and it already does.
  */
  return TITLE_STEPS[TITLE_STEPS.length - 1];
}
