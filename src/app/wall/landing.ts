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

/**
 * §W.29: the arrival's offset as the scroll that replaces it. The server
 * paints the composition translated by the arrival negated, with the
 * region's scroll at zero; when the person's scroll wins and the arrival is
 * not applied, the translate is still cleared, and the scroll grows by this
 * so what is under their eye does not move. Nothing when there is no offset.
 */
export function offsetOf(transform: string): readonly [number, number] {
  const m = /translate\((-?[\d.]+)px,\s*(-?[\d.]+)px\)/.exec(transform);
  return m === null ? [0, 0] : [-Number(m[1]), -Number(m[2])];
}

export function parseMatrix(transform: string): number[] {
  const inner = /matrix\(([^)]+)\)/.exec(transform)?.[1] ?? '';
  return inner.split(/[\s,]+/).filter((t) => t !== '').map(Number);
}
