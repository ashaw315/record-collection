import { describe, expect, it } from 'vitest';
import { rowIsSleeve, SLEEVE_MAX_LUMINANCE, SLEEVE_MIN_LUMINANCE } from './sleeve-rows';

/**
 * **The predicate that could not name its subject.**
 *
 * `e2e/wall-scene.spec.ts:1093` scans screenshot rows for the pulled sleeve. It
 * failed nine times over five weeks with byte-identical values, read twice as a
 * geometry defect and once as an off-by-one, and was neither: **the predicate
 * `range < 12 && mean > 50` matches the WHITE PAGE HEADING above the canvas**
 * (`range=0 mean=250`) exactly as well as it matches the sleeve
 * (`range≈0 mean≈65`).
 *
 * Only `region.top` separated them, by one pixel. This file is where that is now
 * settled, because the predicate is a pure function of pixel statistics and
 * needs no browser to test.
 *
 * Measured on a real frame (scratchpad/1093-evidence/probe-full.png):
 *
 *   rows 0..171    range=0.0    mean=250.0   page heading (white)
 *   rows 283..526  range≈0      mean=64.6    the sleeve
 *   wall rows      range≈110    mean≈50-67   spines and rotated text
 *   panel rows     range small  mean=18-36   the dark panel below
 */
describe('rowIsSleeve names the sleeve and nothing else', () => {
  /**
   * **The bug, stated as a test.** Fails against `range < 12 && mean > 50`,
   * which returns true here.
   */
  it('rejects the white page heading above the canvas', () => {
    expect(rowIsSleeve({ range: 0, mean: 250 })).toBe(false);
  });

  it('accepts the sleeve as actually measured', () => {
    expect(rowIsSleeve({ range: 0, mean: 64.6 })).toBe(true);
  });

  it('rejects the striped wall, which varies across the band', () => {
    expect(rowIsSleeve({ range: 110.9, mean: 49.8 })).toBe(false);
    expect(rowIsSleeve({ range: 112.9, mean: 67.6 })).toBe(false);
  });

  it('rejects the dark panel below the sleeve', () => {
    expect(rowIsSleeve({ range: 2, mean: 18 })).toBe(false);
    expect(rowIsSleeve({ range: 2, mean: 36 })).toBe(false);
  });

  /*
   * The bounds are asserted as VALUES, not just through examples, because the
   * white-heading bug was a missing upper bound and a later edit could remove it
   * again while every example above still passed.
   */
  it('bounds luminance on BOTH sides, which is what the heading defeated', () => {
    expect(SLEEVE_MIN_LUMINANCE).toBeGreaterThan(36);
    expect(SLEEVE_MAX_LUMINANCE).toBeLessThan(250);
    expect(SLEEVE_MAX_LUMINANCE).toBeGreaterThan(64.6);
  });

  it('rejects a row just above the upper bound', () => {
    expect(rowIsSleeve({ range: 0, mean: SLEEVE_MAX_LUMINANCE + 0.1 })).toBe(false);
  });
});
