import { describe, expect, it } from 'vitest';
import { discReference, tileColumnsAt, tileWidth } from './images-disc';

/**
 * §60 (step 70): "The Images quarter-disc is sized against a stated
 * reference height: the section's heading, its padding and one tile row,
 * with the cover note excluded at every count. One tile row is notional:
 * the column width at that viewport, since tiles are square, plus the
 * badge and caption, not the first rendered row."
 */
describe('§60: the disc’s reference is a height, not a rendering', () => {
  it('counts the grid’s columns by the viewport, as the grid’s own breakpoints do: two, three from 640, four from 1024', () => {
    expect(tileColumnsAt(390)).toBe(2);
    expect(tileColumnsAt(639)).toBe(2);
    expect(tileColumnsAt(640)).toBe(3);
    expect(tileColumnsAt(1023)).toBe(3);
    expect(tileColumnsAt(1024)).toBe(4);
    expect(tileColumnsAt(1920)).toBe(4);
  });

  it('gives a tile the column’s width: the inner width less the gaps, over the columns', () => {
    /* 1440 wide section, 34px insets, four columns with three 8px gaps: (1372 - 24) / 4. */
    expect(tileWidth(1440 - 68, 4)).toBeCloseTo(337, 0);
    expect(tileWidth(390 - 68, 2)).toBeCloseTo(157, 0);
  });

  it('sums the named parts and nothing else: heading, padding above and below, one square tile, its badge line and its caption line', () => {
    expect(discReference({ heading: 71, padding: 34, tile: 337, badge: 20.5, caption: 22 })).toBeCloseTo(71 + 68 + 337 + 20.5 + 22, 5);
  });

  it('is the same for every image count, because no rendered row is in it', () => {
    /* The function takes no count and no rendering: the property is structural, stated so a reader does not look for one. */
    expect(discReference.length).toBe(1);
  });
});
