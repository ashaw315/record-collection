import { describe, expect, it } from 'vitest';
import { renderedArea } from '../../e2e/svg-area';

/**
 * The scale is uniform under `meet`: min of the two ratios, squared. Each case
 * would fail against the product of the two ratios, which is the arithmetic
 * `colour-distribution.spec.ts` carried until 29 Sep.
 */
describe('renderedArea', () => {
  it('scales by the width ratio squared when width binds', () => {
    const area = renderedArea(1, { width: 200, height: 499 }, { width: 100, height: 100 });
    expect(area).toBeCloseTo(2 * 2, 6);
  });

  it('scales by the height ratio squared when height binds', () => {
    const area = renderedArea(1, { width: 432, height: 499 }, { width: 100, height: 150 });
    expect(area).toBeCloseTo((499 / 150) ** 2, 6);
  });

  it('is the product only when the box has the viewBox’s aspect', () => {
    const area = renderedArea(3, { width: 200, height: 300 }, { width: 100, height: 150 });
    expect(area).toBeCloseTo(3 * 4, 6);
  });
});
