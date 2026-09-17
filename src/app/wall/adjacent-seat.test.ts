import { describe, expect, it } from 'vitest';
import { adjacentSeatId, hasAdjacentSeat, navigate } from './adjacent-seat';
import type { PullState } from './WallLabelled';
import { PERCEIVED_END } from './pull-colour';

/**
 * Arrows between pulled records (8a §11.8): wall order, absent at the ends,
 * a slide at the same depth. Adjacency derives from the seat order the
 * anchors already carry — one ordering for the keyboard, the arrows and the
 * links is one thing to keep correct; `adjacent-record.ts` was a second
 * source for the same fact and retires. Its cases carry over.
 */
const order = ['a', 'b', 'c'];

describe('adjacentSeatId', () => {
  it('moves to the neighbour on each side from the middle', () => {
    expect(adjacentSeatId(order, 'b', 'next')).toBe('c');
    expect(adjacentSeatId(order, 'b', 'previous')).toBe('a');
  });
  it('returns null past the last record and before the first', () => {
    expect(adjacentSeatId(order, 'c', 'next')).toBeNull();
    expect(adjacentSeatId(order, 'a', 'previous')).toBeNull();
  });
  it('has a previous from the last and a next from the first', () => {
    expect(adjacentSeatId(order, 'c', 'previous')).toBe('b');
    expect(adjacentSeatId(order, 'a', 'next')).toBe('b');
  });
  it('returns null when the current record is not in the order, and on a single-record wall', () => {
    expect(adjacentSeatId(order, 'zz', 'next')).toBeNull();
    expect(adjacentSeatId(['only'], 'only', 'next')).toBeNull();
    expect(adjacentSeatId(['only'], 'only', 'previous')).toBeNull();
  });
});

describe('hasAdjacentSeat — the arrow is present only where there is somewhere to go', () => {
  it('mirrors adjacentSeatId', () => {
    expect(hasAdjacentSeat(order, 'a', 'previous')).toBe(false);
    expect(hasAdjacentSeat(order, 'a', 'next')).toBe(true);
    expect(hasAdjacentSeat(order, 'c', 'next')).toBe(false);
  });
});

describe('navigate — a slide at the same depth, along the collection', () => {
  const held: PullState = { id: 'b', direction: 'out', progress: 1 };

  it('sends the held record back and brings the neighbour out, both from 0 on the same clock', () => {
    /* Changing depth would be a second pull; the arrows move along the collection, not into it. */
    expect(navigate([held], order, 'next')).toEqual([
      { id: 'b', direction: 'back', progress: 0 },
      { id: 'c', direction: 'out', progress: 0 },
    ]);
  });

  it('does nothing at an end, or before the held record has visibly arrived', () => {
    expect(navigate([{ id: 'c', direction: 'out', progress: 1 }], order, 'next')).toBeNull();
    expect(navigate([{ id: 'b', direction: 'out', progress: PERCEIVED_END - 0.05 }], order, 'next')).toBeNull();
    /* From the perceived end — when the panel and its arrows are up — it goes. */
    expect(navigate([{ id: 'b', direction: 'out', progress: PERCEIVED_END }], order, 'next')).not.toBeNull();
    expect(navigate([], order, 'next')).toBeNull();
  });
});
