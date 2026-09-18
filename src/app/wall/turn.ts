import { coverTransform, type RecordBox } from './geometry';
import { ARROW_LANE, LANDING_PAD, parseMatrix, type View } from './landing';

/**
 * Phase two of the pull (8a §11.14): **out, then round.** The record leaves
 * its slot in the projection — §11.2's pull, unchanged — and once it is
 * clear of the row it turns to face the reader and squares up, ending on
 * the page's plane. §11.10 and §11.9 were both right and both stated over
 * the wrong subject: the record stays sheared through phase one and lands
 * square at the end of phase two.
 *
 * **The two phases abut with no hold, and the boundary is legible from the
 * velocity.** The pull is ease-out, so it arrives at rest; the turn is
 * ease-in-out, so it leaves from rest. Velocity returning to zero between
 * them is what makes two motions read as two — a hold would read as a
 * stall, a shared curve as one motion with a kink.
 *
 * **The turn is the record departing the drawing.** An isometric projection
 * has no orientation at which a face is exactly face-on, so this is not a
 * rotation inside the drawing; the cover's four corners go from the
 * projected parallelogram to the page square. Both are parallelograms, so
 * every step is an affine map of the cover's own rect, and the group that
 * carried the cover through phase one carries it through phase two.
 *
 * What the probe settles, since the shape is ruled and the timing is not:
 * phase two's duration (hypothesis: faster than the pull — a turn covers
 * less distance, and a slow turn reads as a swivel), whether zero hold reads
 * as two motions, and whether a straight corner path reads as a turn or as
 * a shape morphing. `CornerPath` is that last question as a parameter.
 */

/** The open figure. Faster than the pull is the hypothesis; the probe is where it is watched. */
export const TURN_DURATION_MS = 600;

/** How the cover's corners travel: entries straight, or the top edge swinging through the angle. */
export type CornerPath = 'linear' | 'rotation';
export type TurnConfig = { ms: number; path: CornerPath };
export type Square = { x: number; y: number; size: number };

/** Ease-in-out cubic: leaves from rest, arrives at rest. Clamped, like the pull's. */
export function turnEase(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** §11.9's square — the largest the region holds inside the padding and the arrow lanes — now phase two's end. */
export function pageSquare(view: View): Square {
  const size = Math.max(0, Math.min(view.width - 2 * (LANDING_PAD + ARROW_LANE), view.height - 2 * LANDING_PAD));
  return { size, x: view.x + (view.width - size) / 2, y: view.y + (view.height - size) / 2 };
}

const format = (m: readonly number[]) => `matrix(${m.join(' ')})`;

/**
 * The cover group's matrix `eased` of the way through the turn: the landed
 * cover's own matrix at 0 — exactly, so the turn shares the pull's history —
 * and the page square at 1, exactly axis-aligned.
 */
export function turnMatrixAt(box: RecordBox, square: Square, eased: number, path: CornerPath): string {
  const source = coverTransform(box);
  if (eased <= 0) return source;
  const to = [square.size / box.depth, 0, 0, square.size / box.height, square.x, square.y];
  if (eased >= 1) return format(to);
  const from = parseMatrix(source);
  const mix = (index: number) => from[index] + (to[index] - from[index]) * eased;
  if (path === 'linear') return format(from.map((_, index) => mix(index)));
  /*
    Rotation: the top edge swings from the wall's −30° to 0° while its
    length grows, so the corners follow arcs; the vertical edge stays
    vertical throughout, as it does on both ends.
  */
  const angle = Math.atan2(from[1], from[0]) * (1 - eased);
  const length = 1 + (to[0] - 1) * eased;
  return format([length * Math.cos(angle), length * Math.sin(angle), 0, mix(3), mix(4), mix(5)]);
}

/** The same, at `progress` of the turn on its own curve. */
export function turnMatrix(box: RecordBox, square: Square, progress: number, path: CornerPath): string {
  return turnMatrixAt(box, square, turnEase(progress), path);
}
