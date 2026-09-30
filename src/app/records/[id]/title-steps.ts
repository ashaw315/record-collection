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
import { GRID_FORK } from './band-geometry';

export const TITLE_STEPS = [144, 120, 96, 72] as const;

/** §33: "the artist line is five-ninths of the title". */
export const ARTIST_OF_TITLE = 5 / 9;

/** §33: the demand is measured "with 24px of gap", and the gap is a floor. */
export const STEP_GAP = 24;

/** The identity cell's padding on each side (§4.2's cell). */
export const IDENTITY_PADDING = 18;
/**
 * **The title's measure, one width from 480 up (§48, §49): the 480 cell less
 * its 1px rule and 18 of padding a side, 443.** Every wider cell pads down to
 * it -- 38 a side at §48's 520, about 58 at 1679 -- so no fork changes the
 * type. Derived, not typed: §45's argument against the 412 box stands.
 */
export const TITLE_MEASURE = GRID_FORK / 3 - 1 - 2 * IDENTITY_PADDING;

/*
  §45 (step 53): no supply constant. "Two constants stood in for the cell: a
  supply of 510 on height, and a box of 412 on width... the same defect on two
  axes, a figure written at one size and never re-derived." The supply is the
  rendered content track's inner height and the measure its width, read by
  `TitleStep.tsx` at every window. The step set still quantises them.
*/

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

/** The four pairs as one scale (§33 gives the artist lines; §45 keeps the pair together). */
export const TITLE_PAIRS = TITLE_STEPS.map((title) => ({ title, artist: artistStep(title) }));

export type TitlePair = { title: number; artist: number; artistLowered: boolean };

/**
 * **§45: the largest pair at which the title fits the cell on both axes and
 * the artist sets on one line.** Every input is a MEASUREMENT the browser
 * alone has: how many lines a string sets to at a size, how tall the cell's
 * content then is, whether any line is wider than the measure, and how many
 * lines the artist takes at the pair's artist size.
 *
 *   - height: demand plus the gap within supply (§33 stands);
 *   - width: no line of the title may exceed the measure, "so a step whose
 *     longest word is wider than the measure is refused, whatever its height";
 *   - the pair: "the ladder takes the largest pair at which the artist sets
 *     on one line, down to the smallest pair, and only below that does the
 *     artist wrap" -- so 72/40 is taken whether or not the artist fits.
 *
 * `artistLowered` reports the cost §45 states rather than hides: true when a
 * larger pair fitted on height and width and the artist's line count alone
 * brought the title down.
 */
export function titlePair({
  demandAt,
  supply,
  overflowsAt,
  artistLinesAt,
}: {
  demandAt: (title: number) => number;
  supply: number;
  overflowsAt: (title: number) => boolean;
  artistLinesAt: (artist: number) => number;
}): TitlePair {
  let artistLowered = false;
  for (const [i, pair] of TITLE_PAIRS.entries()) {
    const smallest = i === TITLE_PAIRS.length - 1;
    if (overflowsAt(pair.title)) continue;
    if (demandAt(pair.title) + STEP_GAP > supply) continue;
    if (!smallest && artistLinesAt(pair.artist) > 1) { artistLowered = true; continue; }
    return { ...pair, artistLowered };
  }
  /*
    §33: "If 72 does not fit, §4.2's give order runs as now." The smallest pair
    is the floor rather than a failure -- the give order handles what happens
    below it, and it already does.
  */
  const last = TITLE_PAIRS[TITLE_PAIRS.length - 1];
  return { ...last, artistLowered };
}

/**
 * **§50 (step 58): the field's proportion is its floor.** "A band past 4 : 1
 * reads as a rule, which §13 gives to marks, not fields." The floor is
 * judged on the rendered height, whichever term set it.
 */
export const FIELD_ASPECT_FLOOR = 4;

export type FieldTerm = 'gap' | 'stack' | 'cap';

/**
 * §50: the field's height is the smallest of the gap the ladder leaves, the
 * title stack, and the construction's minimum ink over the field's width
 * (§52); it is drawn only where that height keeps the field within 4 : 1.
 */
export function fieldHeight({ gap, stack, cap, width = TITLE_MEASURE }: { gap: number; stack: number; cap: number; width?: number }): { height: number; term: FieldTerm; drawn: boolean; aspect: number } {
  const terms: ReadonlyArray<readonly [FieldTerm, number]> = [['gap', gap], ['stack', stack], ['cap', cap]];
  let [term, height] = terms[0];
  for (const [t, v] of terms) if (v < height) [term, height] = [t, v];
  if (height <= 0) return { height: 0, term, drawn: false, aspect: Number.POSITIVE_INFINITY };
  const aspect = width / height;
  return { height, term, drawn: aspect <= FIELD_ASPECT_FLOOR, aspect };
}
