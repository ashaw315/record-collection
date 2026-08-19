import { spineWidth } from '../shelf/spine';
import { BOX_THICKNESS_RATIO } from './BoxCanvas';

/**
 * The record as an object: how thick it is, and how much shelf it takes up.
 *
 * **These had become two implementations of one thing.** `WallScene` built its
 * own box using the spine's width as its depth — about 1:11 — while `BoxCanvas`
 * uses `BOX_THICKNESS_RATIO`, 1:25. Two answers to "how thick is a record",
 * which is the shape NOTES records under `genreSubtree` and `hasGatefold`: it
 * drifts silently as either is tuned, and 1:25 is a value QA chose BY LOOKING
 * against 1:40 and 1:70, so it is exactly the kind that gets re-tuned.
 *
 * `BoxCanvas`'s own comment named the condition for resolving it — "two
 * renderers, two values, until one replaces the other" — and the wall scene is
 * that replacement. So the duplication is eliminated rather than verified: this
 * module re-exports the one ratio rather than restating it.
 *
 * **What remains separate is a real boundary, and it is not a second
 * thickness.** How much shelf a spine occupies is deliberately WIDER than the
 * record is thick, because §10b's 1:12 is a legibility rule: at a true sleeve
 * ratio a spine is about 4px wide, narrower than a 9px glyph, and the spine
 * text the whole wall depends on becomes impossible. 1:40 was arithmetic about
 * sleeves and lost to reading.
 *
 * Two quantities, one of each — rather than one quantity with two answers.
 *
 * ---
 *
 * **Why a spine in the wall is drawn thicker than the record really is**, which
 * is the part that looks like a fudge and is not.
 *
 * Measured: at 1:25 a 240px record is 9.6px thick. `spineLabelPlan` fits a
 * glyph across 62% of the spine, which at 9.6px is a **6px font** — below the
 * ~9px the CSS wall used and comfortably illegible. §10b already settled this
 * when it moved from 1:40 to 1:12: "at 160px tall that is 4px, narrower than a
 * 9px glyph, so the spine text §10b requires becomes impossible and the wall
 * becomes colour bars you must hover one at a time to identify."
 *
 * So the wall draws a record at its shelf FOOTPRINT and the pulled record at
 * its true THICKNESS. That is not two answers to one question: a spine is how a
 * record presents on a shelf, at a proportion chosen so it can be read, and the
 * pulled record is the object in your hands, at the proportion chosen by
 * looking. The rise is the transition between the two, and it interpolates.
 */

/**
 * How thick a record is, in the same units as its height.
 *
 * The single source: `BOX_THICKNESS_RATIO`, chosen by looking. Anything that
 * draws a record's edge asks here.
 */
export function recordDepth(height: number): number {
  return height * BOX_THICKNESS_RATIO;
}

/**
 * How much shelf a record occupies when it is standing in the wall.
 *
 * Deliberately wider than `recordDepth` — see above. This is §10b's 1:12 and it
 * varies a little per record so the wall has texture rather than reading as a
 * barcode.
 */
export function spineFootprint(recordId: string): number {
  return spineWidth(recordId);
}

/**
 * How deep to draw a record's box at a given point in the rise.
 *
 * From the shelf footprint at rest to the true thickness in your hands. That
 * transition is what reconciles the two — see the note above on why a spine in
 * the wall is drawn thicker than a record really is.
 *
 * Linear rather than eased: `risePose` already owns the motion's shape, and
 * easing the thickness separately would give the object two different ideas
 * about how far through the rise it is.
 */
export function boxDepth({
  recordId,
  height,
  progress,
}: {
  recordId: string;
  height: number;
  progress: number;
}): number {
  const t = Math.min(1, Math.max(0, progress));
  const from = spineFootprint(recordId);
  const to = recordDepth(height);

  return from + (to - from) * t;
}
