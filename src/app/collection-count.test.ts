import { describe, expect, it } from 'vitest';
import { collectionCountLabel } from './collection-count';

/**
 * **The count says what the wall no longer says in furniture.**
 *
 * The four-row minimum was removed (A24d amended): the wall is now as tall as
 * its contents, so a filtered result that fills one row IS one row. The signal
 * that most of the collection is hidden moves from empty shelves to this line —
 * "34 of 312 records" when a filter is active, the plain count when it is not.
 *
 * A pure function because the string is a decision (singular/plural, filtered/
 * not) and the page should not carry that branching inline. Each test names the
 * branch of `collectionCountLabel` it fails against.
 */

describe('collectionCountLabel', () => {
  it('states the plain count when no filter is active', () => {
    expect(collectionCountLabel({ matched: 312, total: 312, filtered: false })).toBe('312 records');
  });

  it('says "of" the collection total when a filter is active', () => {
    /* The number the empty shelves used to imply — matched against the whole. */
    expect(collectionCountLabel({ matched: 34, total: 312, filtered: true })).toBe(
      '34 of 312 records',
    );
  });

  it('is singular at one record, unfiltered', () => {
    expect(collectionCountLabel({ matched: 1, total: 1, filtered: false })).toBe('1 record');
  });

  it('keeps "records" plural on the TOTAL when one record matched a filter', () => {
    /*
      "1 of 312 records" — the noun agrees with the collection, not the match,
      because the phrase is about the collection. A naive singular on `matched`
      would read "1 of 312 record".
    */
    expect(collectionCountLabel({ matched: 1, total: 312, filtered: true })).toBe(
      '1 of 312 records',
    );
  });

  it('says none matched without a bare "0 of"', () => {
    /* A filter that hides everything: still legible, still names the total. */
    expect(collectionCountLabel({ matched: 0, total: 312, filtered: true })).toBe(
      '0 of 312 records',
    );
  });
});
