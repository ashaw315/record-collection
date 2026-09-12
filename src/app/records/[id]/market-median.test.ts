import { describe, expect, it } from 'vitest';
import { marketFigures } from './market-median';

/**
 * The market figure the grid shows (7a §4: "the only 40 on the page").
 *
 * **`prices[0]` was the most recent observation, not the median.** It rendered
 * $61.00 for a record whose observations were 24.00 / 9.99 / 61.00 — the
 * highest value presented as the middle one, which is a wrong answer about a
 * real record rather than a rounding difference.
 *
 * Both parities exist in the collection: fourteen records carry two
 * observations, one carries six, and one carries none.
 */
describe('the median', () => {
  it('is the value itself for a single observation', () => {
    const figures = marketFigures(['24.00']);

    expect(figures?.median).toBe('24.00');
    expect(figures?.low).toBe('24.00');
    expect(figures?.high).toBe('24.00');
  });

  /**
   * **The even case, which is the collection's common one** — fourteen of
   * seventeen records have exactly two observations. A median of two is the
   * mean of the middle pair, not either endpoint.
   */
  it('is the mean of the middle pair for two observations', () => {
    expect(marketFigures(['24.00', '18.50'])?.median).toBe('21.25');
  });

  it('is the middle value for an odd count, whatever the input order', () => {
    expect(marketFigures(['61.00', '9.99', '24.00'])?.median).toBe('24.00');
    expect(marketFigures(['9.99', '24.00', '61.00'])?.median).toBe('24.00');
    expect(marketFigures(['24.00', '61.00', '9.99'])?.median).toBe('24.00');
  });

  it('is the mean of the two middles for a larger even count', () => {
    // Six observations, which one real record has.
    expect(marketFigures(['10.00', '20.00', '30.00', '40.00', '50.00', '60.00'])?.median).toBe(
      '35.00',
    );
  });

  /**
   * The case that produced the defect: sorted by value rather than trusting
   * input order, which was the recency order the query returned.
   */
  it('does not return the most recent observation', () => {
    // As they arrive from `listPricesForRecord` — newest first.
    const figures = marketFigures(['61.00', '24.00', '9.99']);

    expect(figures?.median, 'the middle by VALUE').toBe('24.00');
    expect(figures?.median).not.toBe('61.00');
  });
});

describe('the range', () => {
  it('reports the lowest and highest by value, not by position', () => {
    const figures = marketFigures(['24.00', '9.99', '61.00']);

    expect(figures?.low).toBe('9.99');
    expect(figures?.high).toBe('61.00');
  });

  it('compares numerically rather than as strings', () => {
    /*
      A string comparison puts '9.99' above '61.00' because '9' > '6'. That is
      the bug the previous version had in its reduce, and it is invisible until
      a single-digit price meets a double-digit one — which every record in the
      collection has.
    */
    const figures = marketFigures(['9.99', '61.00']);

    expect(figures?.low).toBe('9.99');
    expect(figures?.high).toBe('61.00');
  });
});

describe('no observations', () => {
  /**
   * §1.3: the market module is then EMPTY and carries a diagonal — so this
   * returns null rather than a zero. A zero would render a $0.00 figure at 40px
   * for a record nobody has priced.
   */
  it('is null rather than a zero figure', () => {
    expect(marketFigures([])).toBeNull();
  });

  it('is null rather than throwing on a malformed value', () => {
    // `price` is NOT NULL in the schema, but it is text-typed decimal — a
    // value that will not parse is a data problem, not a crash.
    expect(marketFigures(['not-a-price'])).toBeNull();
  });
});

describe('formatting', () => {
  it('keeps two decimal places', () => {
    expect(marketFigures(['24'])?.median).toBe('24.00');
    expect(marketFigures(['24.5'])?.median).toBe('24.50');
  });

  it('rounds a half-cent median to two places', () => {
    // 21.255 -> 21.26, so the displayed figure never carries a third decimal.
    expect(marketFigures(['21.25', '21.26'])?.median).toBe('21.26');
  });
});
