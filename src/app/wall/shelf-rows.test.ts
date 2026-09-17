import { describe, expect, it } from 'vitest';
import { PER_SHELF, shelfRows } from './shelf-rows';

/**
 * §11.9: rows are a fixed capacity, and no-reflow extends to wrapping — a
 * record that changes shelf when the window narrows has a position that is
 * a fact about the viewport rather than the collection, and §11.1 leaves
 * position carrying the order. The four-shelf minimum went with the fork.
 *
 * Forty is Wall Density's figure — "200 records, five shelves of forty" at
 * the 240 scale — the one number for what a shelf holds that was drawn and
 * measured rather than derived from a view or a count of the collection.
 */
describe('shelfRows — fixed seats per row', () => {
  it('holds forty a shelf, from Wall Density', () => {
    expect(PER_SHELF).toBe(40);
    expect(shelfRows(200)).toEqual([40, 40, 40, 40, 40]);
    expect(shelfRows(41)).toEqual([40, 1]);
  });

  it('puts seventeen on one shelf — no minimum number of shelves', () => {
    expect(shelfRows(17)).toEqual([17]);
    expect(shelfRows(4)).toEqual([4]);
    expect(shelfRows(0)).toEqual([]);
  });
});
