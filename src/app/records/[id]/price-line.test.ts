import { describe, expect, it } from 'vitest';
import { priceLine, priceTypeMeaning } from './price-line';

/**
 * How a single price observation reads (QA, step 9).
 *
 * The sparkline plots by time and the range states the bounds — but "3
 * observations, $8.00 to $120.00" cannot tell you whether the $120 was last
 * week or three years ago, and nothing said which observation was new or used.
 * The reader could see the shape and not the facts behind it.
 */

describe('priceTypeMeaning', () => {
  it('explains asking rather than labelling it', () => {
    /**
     * **"Asking" alone does not say that nobody paid it**, and that is the whole
     * point of the type — the same reasoning as the estimated-value sentence,
     * where the figure and its meaning arrive together.
     *
     * This is also the field where §4.2's old `best_dig` value produced "$120.00
     * best dig", which read as "best price". A bare enum label reintroduces that
     * risk in a different vocabulary.
     */
    const said = priceTypeMeaning('asking');

    expect(said).toMatch(/nobody paid|not paid|no one paid/i);
  });

  it('distinguishes used as money that changed hands', () => {
    // The contrast that makes `asking` legible: `used` is evidence, `asking` is
    // a request. §7.6 only sums the first.
    expect(priceTypeMeaning('used')).toMatch(/sold|paid|changed hands/i);
  });

  it('describes new as a sealed copy, not a recent observation', () => {
    /**
     * The discriminating case. "New" is ambiguous in a price history where every
     * row has a date — it names the CONDITION of the copy, not the recency of
     * the observation, and a reader scanning dates would naturally assume the
     * latter.
     */
    const said = priceTypeMeaning('new');

    expect(said).toMatch(/sealed|unplayed|never played/i);
    expect(said, 'nothing about recency').not.toMatch(/recent|latest|newest/i);
  });

  it('never uses the phrase "best dig" for any type', () => {
    // CLAUDE.md §8, in the copy where the conflation was actually shipped.
    for (const type of ['new', 'used', 'asking'] as const) {
      expect(priceTypeMeaning(type).toLowerCase()).not.toContain('best dig');
      expect(priceTypeMeaning(type).toLowerCase()).not.toContain('best price');
    }
  });
});

describe('priceLine', () => {
  const observation = {
    id: 'p-1',
    price: '120.00',
    priceType: 'asking' as const,
    recordedAt: '2024-03-15T00:00:00Z',
  };

  it('carries the amount, the date and what the type means', () => {
    const line = priceLine(observation);

    expect(line.amount).toBe('$120.00');
    expect(line.date).toBe('2024-03-15');
    expect(line.meaning).toMatch(/nobody paid/i);
  });

  it('uses the recorded date, not today', () => {
    /**
     * The QA finding in one assertion: the sparkline plots by time, and the
     * reader could not see the times. A three-year-old $120 and last week's
     * $120 are different facts about a record.
     */
    const line = priceLine({ ...observation, recordedAt: '2021-11-02T09:30:00Z' });

    expect(line.date).toBe('2021-11-02');
  });

  it('formats the amount as money rather than a bare number', () => {
    expect(priceLine({ ...observation, price: '8.5' }).amount).toBe('$8.50');
  });

  it('handles a Date as well as a string, since the driver returns both', () => {
    const line = priceLine({ ...observation, recordedAt: new Date('2024-03-15T00:00:00Z') });

    expect(line.date).toBe('2024-03-15');
  });
});
