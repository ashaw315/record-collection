import { describe, expect, it } from 'vitest';
import { isSettled, type PaintFrame } from '../../e2e/paint-settle';

/**
 * The §43 recorder's settle predicate. Replaces a fixed two-second wait per
 * cold load (119 loads: 4 of the test's 6 minutes) with "the last SPAN frames
 * are identical". Each test names the branch it fails against.
 */
const frame = (band: number, cells: Array<[string, number, number, number, number]>, t = 0): PaintFrame => ({ t, band, cells });
const A = frame(234, [['note', 0, 0, 300, 234], ['about', 300, 0, 300, 234]]);
const B = frame(234, [['note', 0, 0, 300, 234], ['about', 301, 0, 300, 234]]);
const C = frame(240, [['note', 0, 0, 300, 240], ['about', 300, 0, 300, 240]]);

describe('isSettled', () => {
  it('is not settled with fewer frames than the span (the length guard)', () => {
    expect(isSettled([A, A, A], 4)).toBe(false);
  });

  it('is settled when the last span frames are identical (the comparison)', () => {
    expect(isSettled([A, A, A, A], 4)).toBe(true);
  });

  it('is not settled when a cell moved one pixel inside the span (cells compared, not just band height)', () => {
    expect(isSettled([A, A, A, B], 4)).toBe(false);
  });

  it('is not settled when the band height changed inside the span', () => {
    expect(isSettled([A, A, C, C], 4)).toBe(false);
  });

  it('settles once movement is older than the span (only the tail is compared)', () => {
    expect(isSettled([C, B, A, A, A, A], 4)).toBe(true);
  });

  it('ignores frame timestamps, which always differ', () => {
    expect(isSettled([frame(234, A.cells, 1), frame(234, A.cells, 17), frame(234, A.cells, 33)], 3)).toBe(true);
  });
});
