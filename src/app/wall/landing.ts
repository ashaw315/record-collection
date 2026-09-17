import { DEPTH, SPINE_HEIGHT, coverTransform, type PlacedSeat } from './geometry';
import { pullEase } from './pull-curve';

/**
 * Where the pull lands (8a §11.9): the pulled record takes the drawing's
 * whole region — the largest square it holds, unsheared. The right face IS
 * the cover, so the face already toward the reader straightens and grows:
 * §11.2's one curve drives translation, scale and shear together, and the
 * shear resolving to zero is not rotation.
 *
 * **At rest the shear is exactly zero.** The end state is CONSTRUCTED — the
 * square's own matrix returned at 1 — rather than approached by
 * interpolation, because a value that rounds to near-zero looks identical at
 * rest and is not the same claim: the gesture reads as "it came out to be
 * looked at" only if it finishes flat.
 */

/** The page's padding, between the region's edge and the square. */
export const LANDING_PAD = 34;
/** Room beside the square for an arrow (44) and a gap — the arrows go with the record. */
export const ARROW_LANE = 56;

/** The visible drawing region, in the svg's own px, relative to its top-left. */
export type View = { x: number; y: number; width: number; height: number };
export type Square = { x: number; y: number; size: number };

export function landingSquare(view: View): Square {
  const size = Math.max(0, Math.min(view.width - 2 * (LANDING_PAD + ARROW_LANE), view.height - 2 * LANDING_PAD));
  return { size, x: view.x + (view.width - size) / 2, y: view.y + (view.height - size) / 2 };
}

export function parseMatrix(transform: string): number[] {
  const inner = /matrix\(([^)]+)\)/.exec(transform)?.[1] ?? '';
  return inner.split(/[\s,]+/).filter((t) => t !== '').map(Number);
}

const format = (m: readonly number[]) => `matrix(${m.join(' ')})`;

/** The cover group's matrix at `eased` of the way from its face to the square. */
export function landingMatrixAt(seat: PlacedSeat, square: Square, eased: number): string {
  const source = coverTransform(seat);
  if (eased <= 0) return source;
  const target = [square.size / DEPTH, 0, 0, square.size / SPINE_HEIGHT, square.x, square.y];
  if (eased >= 1) return format(target);
  const from = parseMatrix(source);
  return format(from.map((value, index) => value + (target[index] - value) * eased));
}

/** The same, at `progress` of the pull on its curve. */
export function landingMatrix(seat: PlacedSeat, square: Square, progress: number): string {
  return landingMatrixAt(seat, square, pullEase(progress));
}
