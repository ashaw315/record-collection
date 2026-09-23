import type { PullState } from './WallLabelled';
import { settled } from './gesture';

/**
 * Arrows between pulled records (8a §W.8): wall order, absent at the ends,
 * a slide at the same depth. Adjacency derives from the SEAT ORDER the
 * anchors already carry — one ordering for the keyboard, the arrows and the
 * links is one thing to keep correct, and `adjacent-record.ts` was a second
 * source for the same fact.
 */
export type Direction = 'next' | 'previous';

export function adjacentSeatId(order: readonly string[], currentId: string, direction: Direction): string | null {
  const index = order.indexOf(currentId);
  if (index === -1) return null;
  const next = direction === 'next' ? index + 1 : index - 1;
  return next < 0 || next >= order.length ? null : order[next];
}

/** The arrow is present only where there is somewhere to go. */
export function hasAdjacentSeat(order: readonly string[], currentId: string, direction: Direction): boolean {
  return adjacentSeatId(order, currentId, direction) !== null;
}

/**
 * The slide: the held record goes back and its neighbour comes out, both
 * from 0 on the same clock. Changing depth would be a second pull; the
 * arrows are movement along the collection rather than into or out of it.
 * Only from a record settled out — settled to the EYE, at the slide's
 * perceived end, which is when its panel and arrows are there to click —
 * and only where there is a neighbour.
 */
export function navigate(
  pulls: readonly PullState[],
  order: readonly string[],
  direction: Direction,
): PullState[] | null {
  const held = pulls.find((pull) => pull.direction === 'out' && settled(pull));
  if (held === undefined) return null;
  const to = adjacentSeatId(order, held.id, direction);
  if (to === null) return null;
  return [
    { id: held.id, direction: 'back', ms: 0 },
    { id: to, direction: 'out', ms: 0 },
  ];
}
