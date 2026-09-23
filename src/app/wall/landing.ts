import type { View } from './view';

/**
 * What survives of the landing module: the page's padding and the arrow
 * lane (§W.9), the matrix reader the specs use, and §W.19's landed size.
 * §W.9's flat square, §W.10's slide-and-grow and §W.19's offset square
 * are all superseded by the assembled gesture (gesture.ts): where the
 * record lands is where its own construction — travel, growth, rotation,
 * finish — puts it.
 */

/** The page's padding, between the region's edge and the drawing. */
export const LANDING_PAD = 34;
/** Room beside the landed record for an arrow (44) and a gap — the arrows go with the record. */
export const ARROW_LANE = 56;
/** §W.19: the landed cover is 560 × 560 — bounded by what must stay visible, not by what fits. */
export const LANDED_SIZE = 560;

export type { View };

export function parseMatrix(transform: string): number[] {
  const inner = /matrix\(([^)]+)\)/.exec(transform)?.[1] ?? '';
  return inner.split(/[\s,]+/).filter((t) => t !== '').map(Number);
}
