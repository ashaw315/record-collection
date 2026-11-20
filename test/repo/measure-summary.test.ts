import { describe, expect, it } from 'vitest';
import { summarize } from '../../scripts/measure-summary.mjs';

/**
 * **The timing summary Q72's budget is set from (the coordinator, 19 Nov).** `scripts/time-describe.mts` times each
 * stage of describing a record and pins the add route's duration from the p90 with room, so the figures have to be the
 * ones the name says: a median that is the middle value, a p90 by nearest rank that is a value from the sample and not
 * an interpolation past its maximum. Fails against a summary that averages, that reads p90 off an empty sample, or that
 * takes the maximum for the p90 of a sample of ten.
 */
describe('summarize', () => {
  it('gives the count, the least, the middle value, the nearest-rank p90 and the most, each a value from the sample', () => {
    const s = summarize([120, 80, 300, 90, 100, 110, 95, 85, 105, 2000]);
    expect(s).toEqual({ n: 10, min: 80, median: 102.5, p90: 300, max: 2000 });
  });

  it('reads an odd sample’s median as its middle value and a one-value sample as that value throughout', () => {
    expect(summarize([3, 1, 2])).toEqual({ n: 3, min: 1, median: 2, p90: 3, max: 3 });
    expect(summarize([42])).toEqual({ n: 1, min: 42, median: 42, p90: 42, max: 42 });
  });

  it('says an empty sample has no figures rather than inventing zeros', () => {
    expect(summarize([])).toEqual({ n: 0, min: null, median: null, p90: null, max: null });
  });
});
