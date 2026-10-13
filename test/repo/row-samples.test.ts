import { describe, expect, it } from 'vitest';
import { rowSamples } from '../../e2e/row-samples';

/**
 * The sampling convention for a row's height, held in one place (the
 * coordinator, 13 Oct: two sightings of one reader defect in one screen
 * means there will be a third). The browser reads a point as the one-pixel
 * square below and right of it, so a sample a quarter above a row's foot
 * belongs to the next row whatever is built. Samples at the row's top plus
 * 0, 1, … height − 1 tile the row exactly, on a whole pixel or a half.
 *
 * Fails against a helper that adds a quarter (the three readings of 43 of
 * 44 on stats), one that starts a pixel in, or one that reaches the foot.
 */
describe('rowSamples', () => {
  it('tiles a row of 44 from its own top: top + 0, 1, … 43, and never its foot', () => {
    const samples = rowSamples(100);
    expect(samples).toHaveLength(44);
    expect(samples[0]).toBe(100);
    expect(samples[43]).toBe(143);
    expect(samples).toEqual(Array.from({ length: 44 }, (_, dy) => 100 + dy));
    expect(samples.includes(144), 'the foot is the next row’s first pixel').toBe(false);
  });

  it('adds nothing to a top on a half pixel: the half is the row’s, the quarter was the defect', () => {
    const samples = rowSamples(480.5);
    expect(samples[0]).toBe(480.5);
    expect(samples[43]).toBe(523.5);
    expect(samples.some((y) => y % 1 !== 0 && y % 1 !== 0.5), 'no sample stands on a quarter').toBe(false);
  });

  it('takes a row’s own height when it is given one, whole pixels only', () => {
    expect(rowSamples(10, 3)).toEqual([10, 11, 12]);
    expect(rowSamples(10, 3.7), 'a fractional height is floored: the last part-pixel is not a square the row owns').toEqual([10, 11, 12]);
    expect(rowSamples(10, 0)).toEqual([]);
  });
});
