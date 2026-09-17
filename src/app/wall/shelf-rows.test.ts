import { describe, expect, it } from 'vitest';
import { MIN_SHELVES, PER_SHELF, shelfRows } from './shelf-rows';

/**
 * How the collection divides into shelves (the D2 composition).
 *
 * The composition stacks four shelves; Wall Density's 200 case is five of
 * forty. Both hold: at least four shelves, never more than forty a shelf,
 * records spread evenly so no shelf is a remainder. An empty shelf is not
 * drawn — a plane with nothing on it would be the carcass coming back.
 */
describe('shelfRows', () => {
  it('spreads seventeen over four shelves, front-loaded by one', () => {
    expect(MIN_SHELVES).toBe(4);
    expect(shelfRows(17)).toEqual([5, 4, 4, 4]);
  });

  it('keeps forty a shelf at two hundred — five shelves, Wall Density’s case', () => {
    expect(PER_SHELF).toBe(40);
    expect(shelfRows(200)).toEqual([40, 40, 40, 40, 40]);
    expect(shelfRows(161)).toEqual([33, 32, 32, 32, 32]);
  });

  it('drops empty shelves rather than drawing planes with nothing on them', () => {
    expect(shelfRows(3)).toEqual([1, 1, 1]);
    expect(shelfRows(0)).toEqual([]);
  });
});
