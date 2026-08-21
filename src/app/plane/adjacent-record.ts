/**
 * **Moving between records without putting one back (§10b, 13b).**
 *
 * A record is out; the next one comes forward without a return to the wall.
 * "Next" means next IN THE WALL'S ORDER — the deterministic genre ordering
 * `shelfRecords` already produces, with the top-level-ancestor rule and its
 * tie-break. This does not compute a second order; it indexes into the one the
 * wall was built from, so the arrow and the swipe move through exactly what is
 * shown, filtered or not.
 *
 * Pure, so adjacency and the ends can be pinned without a scene.
 */

export type Direction = 'next' | 'previous';

/**
 * The record adjacent to `currentId` in `order`, or `null` at the end.
 *
 * **`null` at the ends is the decision, and the caller acts on it** — §10b's
 * rules keep rejecting an affordance that appears to work and does not, so the
 * arrow is HIDDEN where this returns null rather than doing nothing on press.
 * Stopping-that-looks-live and wrapping-a-linear-shelf were the other two
 * answers; a wall is a line with two ends, and a shelf does not loop, so it
 * stops — visibly, by the arrow's absence.
 *
 * Returns null too when the current record is not in the order (it was filtered
 * out from under the reader), rather than guessing a neighbour for a record that
 * is no longer shown.
 */
export function adjacentRecordId(
  order: readonly string[],
  currentId: string,
  direction: Direction,
): string | null {
  const index = order.indexOf(currentId);
  if (index === -1) return null;

  const nextIndex = direction === 'next' ? index + 1 : index - 1;
  if (nextIndex < 0 || nextIndex >= order.length) return null;

  return order[nextIndex];
}

/** Whether an arrow in `direction` has a record to move to — the affordance's presence. */
export function hasAdjacent(
  order: readonly string[],
  currentId: string,
  direction: Direction,
): boolean {
  return adjacentRecordId(order, currentId, direction) !== null;
}
