import { oklchToHex, type Oklch, type RecordLadder } from '@/lib/colour/record-ladder';
import { pullEase } from './pull-curve';

/**
 * Colour across the pull (8a §11.2).
 *
 * **The wall at rest is line, ink and paper; colour arrives with the pull.**
 * Not at the end — that reads as confirmation, the record lands and then
 * lights up, an event on a curve whose whole argument is that it has none.
 * Not at the start — that reads as the shelf changing before the record
 * moves. Across it: the record is becoming itself while it comes toward you,
 * which is what the pull means.
 *
 * So the fill is a function of the pull's ONE eased value, the same one that
 * drives translation, scale and the shear — a fade from paper to the record's
 * clamped base, in OKLCH, holding the record's hue throughout because paper
 * has none to lend.
 */

/** The wall's paper, as the drawing paints it. Stated once, in OKLCH. */
export const WALL_PAPER: Oklch = { L: 0.977, C: 0.004, h: 80 };
export const WALL_PAPER_HEX = oklchToHex(WALL_PAPER);

/**
 * The wall's ink, and the field a record with no cover pulls to (§5.3 via
 * §11.8). Not #3a3a3a — a default colour SPEC §4 says never renders — and
 * not "the same clamped base", which has no referent when the sample is
 * null. Colour arrives with the pull because it comes from the cover, and a
 * record with no cover has none to arrive with.
 */
export const WALL_INK = '#161412';
const INK_OKLCH: Oklch = { L: 0.17, C: 0.004, h: 60 };

/**
 * Where the visible gesture ends: a cubic ease-out reaches 97% of travel at
 * t = 1 − ∛0.03 ≈ 0.69 (5b §3 — "the perceived gesture ends at about 97% of
 * travel, t ≈ 0.68"). Derived from the curve rather than chosen, so it moves
 * if the curve does.
 */
export const PERCEIVED_END = 1 - Math.cbrt(0.03);

/**
 * **The return is not the pull played backwards for colour.** A record going
 * back becomes one of seventeen again, and the fade to paper must COMPLETE
 * before the spine reaches the shelf — or a coloured spine sits in the rest
 * state for the last frames and the exception leaks. So the fade runs on the
 * same curve compressed into the visible gesture: by the time the eye sees the
 * record stop moving it is already paper, and the settle happens in paper.
 */
export const RETURN_FADE_END = PERCEIVED_END;

function target(ladder: RecordLadder | null): Oklch {
  return ladder === null ? INK_OKLCH : { L: ladder.baseL, C: ladder.baseC, h: ladder.baseHue };
}

function mix(eased: number, ladder: RecordLadder | null): string {
  if (eased <= 0) return WALL_PAPER_HEX;
  const to = target(ladder);
  if (eased >= 1) return ladder === null ? WALL_INK : oklchToHex(to);

  return oklchToHex({
    L: WALL_PAPER.L + (to.L - WALL_PAPER.L) * eased,
    C: WALL_PAPER.C + (to.C - WALL_PAPER.C) * eased,
    h: to.h,
  });
}

/** The pulled record's fill at `progress` of the pull, 0 seated → 1 pulled. */
export function pullFill(progress: number, ladder: RecordLadder | null): string {
  return mix(pullEase(progress), ladder);
}

/** The returning record's fill at `progress` of the return, 0 pulled → 1 seated. */
export function returnFill(progress: number, ladder: RecordLadder | null): string {
  const fade = Math.min(1, Math.max(0, progress) / RETURN_FADE_END);
  return mix(1 - pullEase(fade), ladder);
}
