import { BANDS } from './band-geometry';
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

/** The identity cell's padding on each side (§4.2's cell). */
export const IDENTITY_PADDING = 18;

/**
 * §40: "The ladder's supply stays the band's 1440 constant, 510: the identity
 * cell's inner height in §27's 547 band, which Code measured as the content
 * track after its padding (§33). So a title's size never depends on the
 * window's height." Above §18's fork the cell takes the band's full height
 * and the extra is slack below the content; the ladder does not see it.
 */
export const LADDER_SUPPLY = BANDS.identity - 1 - 2 * IDENTITY_PADDING;

/*
  No line cap. §33 withdrew its own: "Withdrawn within §33: the title sets in
  at most three lines... Height is the only constraint, and the line count is
  no longer capped. Demand rises with the step, so the largest step that fits
  on height is the one that leaves the least slack." A gate here refused 144
  on Loss Of Life by count when the height was there, and the two-line rule
  before it (33/two-line-ladder) did the same at three.
*/

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
 * The largest step at which the cell's demand, plus the gap, is within its
 * supply. Height is the only condition (§33); the line count is measured and
 * published on the ladder for the reader, and decides nothing.
 *
 * `demandAt` is passed in because it is a MEASUREMENT — how
 * many lines a string sets to at a size, and how tall the cell's content then
 * is. Computing them from a character count here would be the declared-value
 * defect: the answer depends on the font, which only the browser knows.
 */
export function titleStep({
  demandAt,
  supply,
}: {
  demandAt: (step: number) => number;
  supply: number;
}): number {
  for (const step of TITLE_STEPS) {
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
