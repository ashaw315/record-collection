import { SPINE_HEIGHT } from '../shelf/spine';
import { WALL_FOV_DEGREES } from './wall-camera';

/**
 * **Three answers to "how big is a pulled record", for judging by eye.**
 *
 * SCAFFOLDING. Nothing in the live scene imports this, and that isolation is
 * deliberate: `WallScene.tsx` still passes the wall's aspect to its camera, and
 * it keeps doing so until the fill rule is chosen. Putting experimental
 * geometry on `/` is how experimental geometry gets left behind on `/`.
 *
 * The question exists because `FRAME_FILL = 0.55` solves for the record filling
 * 55% of the frame's HEIGHT, which is right on a landscape aperture and wrong
 * on a portrait one. With the camera aspect corrected to the viewport's
 * (`viewportAspect`), a phone still puts the record at 119% of the frame's
 * width — the aspect was a bug, this is a design question, and the two were
 * tangled together until the first was fixed.
 *
 * **Arithmetic can rule a candidate OUT and cannot rule one IN.** 457% is not a
 * judgement call; "does this read as a record in your hands" is §10b's own
 * standard and is visual. So these compute distances and the comparison page
 * renders them.
 */

/** A 12" sleeve is square, so the record is `SPINE_HEIGHT` on both axes. */
const RECORD_SIZE = SPINE_HEIGHT;

const halfAngle = (WALL_FOV_DEGREES * Math.PI) / 360;

/** The current rule's fraction, kept as the baseline the others are judged against. */
export const FRAME_FILL = 0.55;

/**
 * How much of the frame's height the stacked facts card needs beneath the
 * record.
 *
 * **Derived from the card, not chosen as a round number.** `FactsPanel` renders
 * a title, an artist/year line and a variable body; measured at 390px it is
 * roughly 210-260 CSS px tall for a record with a few facts. Against an 844px
 * viewport that is a bit under a third of the height, and the record must also
 * clear the app header and leave a margin.
 *
 * Expressed as a fraction of the FRAME rather than in pixels because the frame
 * is the thing the record is measured against; a pixel figure would have to be
 * reconverted at every distance.
 */
export const CARD_SHARE = 0.34;

export type Frame = { width: number; height: number };

/** The frame's size at a given distance from the camera, for a given aspect. */
export function frameAt(distance: number, aspect: number): Frame {
  const height = 2 * distance * Math.tan(halfAngle);
  return { width: height * aspect, height };
}

/**
 * **A — fill 55% of the frame's HEIGHT.** The current rule, unchanged.
 *
 * Viewport-independent by construction, which was the point when it was
 * written: five records and five hundred put the camera in different places and
 * the record arrives the same apparent size. That property is real and this
 * candidate keeps it. What it does not do is notice that a portrait frame is
 * narrower than it is tall.
 */
export function distanceFillHeight(): number {
  return RECORD_SIZE / (2 * FRAME_FILL * Math.tan(halfAngle));
}

/**
 * **B — fill 55% of the frame's SMALLER dimension.**
 *
 * On a landscape aperture the smaller dimension IS the height, so this is
 * arithmetically identical to A and changes nothing on a desktop. On a portrait
 * one it switches to the width, which is the dimension actually running out.
 *
 * The cost is that the record gets small on a phone — 55% of the width is 25%
 * of the height, leaving most of the frame empty above and below.
 */
export function distanceFillSmaller(aspect: number): number {
  return RECORD_SIZE / (2 * FRAME_FILL * Math.tan(halfAngle) * Math.min(1, aspect));
}

/**
 * **C — fill whatever is left once the stacked card has its room.**
 *
 * The others pick a fraction and let the layout land where it lands. This one
 * takes the constraint the number actually serves — §10b's facts have to be
 * READ, and on a phone they stack beneath the record rather than flanking it —
 * and sizes the record to what remains.
 *
 * So the record takes `1 - CARD_SHARE` of the frame's height, and is also held
 * inside the frame's width, because a rule that serves the card and overflows
 * the aperture has solved the wrong half of the problem. Whichever constraint
 * binds first wins, which is what `Math.max` on the distances expresses:
 * further away is smaller.
 */
export function distanceForStackedCard(aspect: number): number {
  const byHeight = RECORD_SIZE / (2 * (1 - CARD_SHARE) * Math.tan(halfAngle));

  /*
    Held inside the width with a margin, so the sleeve does not touch the edges
    of a 390px screen — a record bled to the frame edge reads as a background,
    which is the failure this whole unit started from.
  */
  const WIDTH_MARGIN = 0.86;
  const byWidth = RECORD_SIZE / (2 * WIDTH_MARGIN * Math.tan(halfAngle) * Math.max(aspect, 0.0001));

  return Math.max(byHeight, byWidth);
}

/**
 * **Re-derived once the card became a summary, not re-tuned.**
 *
 * A, B and C were answers to "how much of the frame should be RESERVED for
 * facts", and that question no longer exists: a summary card's height is a
 * constant, so the reservation is known. What is left is a different question —
 * **how much of the frame's WIDTH should the record occupy** — and it is
 * answered by looking, because "does this still read as an object in a space
 * rather than a full-bleed image" is not arithmetic.
 *
 * So the candidates are now widths, spanning the boundary the developer's read
 * points at ("at least A, possibly bigger"): A's measured 90%, then 95%, then
 * 100%. At 100% the record touches both edges and there is no space around it
 * to be in — that is the far side of the boundary, included so the boundary can
 * be seen rather than guessed at.
 *
 * The old three are kept in the module and no longer offered, because
 * `distanceFillSmaller` and `distanceForStackedCard` carry the reasoning that
 * produced this question and deleting them would leave the re-derivation
 * looking arbitrary.
 */
export type Candidate = {
  key: 'A' | 'B' | 'C';
  label: string;
  /** How much of the FRAME'S WIDTH the record occupies. */
  widthFraction: number;
};

/**
 * The width the record occupies, as a fraction of the frame.
 *
 * `A` is where the old candidate A actually landed once the caption bugs were
 * fixed — 90% — so the comparison starts from the state that was judged rather
 * than from a number nobody has seen.
 */
export const WIDTH_CANDIDATES: Candidate[] = [
  { key: 'A', label: '90% — a record in a space', widthFraction: 0.9 },
  { key: 'B', label: '95% — nearly edge to edge', widthFraction: 0.95 },
  { key: 'C', label: '100% — full bleed', widthFraction: 1 },
];



/** What fraction of the frame the record occupies at a distance — for labelling. */
export function occupancy(distance: number, aspect: number): { width: number; height: number } {
  const frame = frameAt(distance, aspect);
  return { width: RECORD_SIZE / frame.width, height: RECORD_SIZE / frame.height };
}

/**
 * **The size rule: frame in, record dimensions out.**
 *
 * A record is square, so its height follows its width — which means the frame's
 * height only matters as a limit. A record sized to a portrait frame's width
 * must still leave the summary card its room, and on a squat frame (a landscape
 * phone, a short desktop window) the width would otherwise push the record
 * taller than the space available.
 *
 * So: take the requested fraction of the width, and clamp to what the height
 * allows once the card has its share.
 */
export function recordSizeFor({
  frame,
  widthFraction,
  cardFraction,
}: {
  frame: Frame;
  widthFraction: number;
  cardFraction: number;
}): { size: number; limitedBy: 'width' | 'height' } {
  const byWidth = frame.width * widthFraction;
  const byHeight = frame.height * (1 - cardFraction);

  return byWidth <= byHeight
    ? { size: byWidth, limitedBy: 'width' }
    : { size: byHeight, limitedBy: 'height' };
}
