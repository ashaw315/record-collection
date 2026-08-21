import { describe, expect, it } from 'vitest';
import { adjacentRecordId, hasAdjacent } from './adjacent-record';

/**
 * Adjacency in the wall's order. The order itself is `shelfRecords`' (tested
 * there and asserted against the same producer in the E2E); this pins that
 * moving lands on the neighbour and that the ends return null.
 */

const ORDER = ['a', 'b', 'c', 'd'];

describe('adjacentRecordId', () => {
  /**
   * **The discriminating case: a record with neighbours on BOTH sides.** From
   * index 0 an "always move forward" bug is indistinguishable from correct
   * adjacency, so the middle is where next and previous must actually differ.
   */
  it('moves to the neighbour on each side from the middle', () => {
    expect(adjacentRecordId(ORDER, 'b', 'next')).toBe('c');
    expect(adjacentRecordId(ORDER, 'b', 'previous')).toBe('a');
    expect(adjacentRecordId(ORDER, 'c', 'next')).toBe('d');
    expect(adjacentRecordId(ORDER, 'c', 'previous')).toBe('b');
  });

  it('returns null past the last record', () => {
    expect(adjacentRecordId(ORDER, 'd', 'next')).toBeNull();
  });

  it('returns null before the first record', () => {
    expect(adjacentRecordId(ORDER, 'a', 'previous')).toBeNull();
  });

  it('has a previous from the last and a next from the first', () => {
    expect(adjacentRecordId(ORDER, 'd', 'previous')).toBe('c');
    expect(adjacentRecordId(ORDER, 'a', 'next')).toBe('b');
  });

  it('returns null when the current record is not in the order', () => {
    /* Filtered out from under the reader — do not guess a neighbour. */
    expect(adjacentRecordId(ORDER, 'gone', 'next')).toBeNull();
    expect(adjacentRecordId(ORDER, 'gone', 'previous')).toBeNull();
  });

  it('handles a single-record wall: no neighbour either way', () => {
    expect(adjacentRecordId(['only'], 'only', 'next')).toBeNull();
    expect(adjacentRecordId(['only'], 'only', 'previous')).toBeNull();
  });
});

describe('hasAdjacent — the arrow is present only where there is somewhere to go', () => {
  it('is false at each end and true in the middle', () => {
    expect(hasAdjacent(ORDER, 'a', 'previous')).toBe(false);
    expect(hasAdjacent(ORDER, 'a', 'next')).toBe(true);
    expect(hasAdjacent(ORDER, 'd', 'next')).toBe(false);
    expect(hasAdjacent(ORDER, 'd', 'previous')).toBe(true);
    expect(hasAdjacent(ORDER, 'b', 'next')).toBe(true);
    expect(hasAdjacent(ORDER, 'b', 'previous')).toBe(true);
  });
});
