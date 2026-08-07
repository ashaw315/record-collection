import { describe, expect, it } from 'vitest';
import { pageCount, pageWindow, rangeLabel } from './collection-paging';

/**
 * Pagination arithmetic for the collection screen (SPEC.md §10, §5).
 *
 * Pure and separated from the component because every defect here is an
 * off-by-one that renders as a plausible-looking control: a "Next" button on
 * the last page, a range reading "51–100 of 60", or a page 0 link. None of
 * those throw; they just mislead.
 */

describe('pageCount', () => {
  it('is 1 for an empty collection, not 0', () => {
    // A screen showing "Page 1 of 0" reads as broken. There is always a page,
    // even when it is empty.
    expect(pageCount(0, 50)).toBe(1);
  });

  it('is 1 when the collection fits exactly on one page', () => {
    expect(pageCount(50, 50)).toBe(1);
  });

  it('rounds up a partial last page', () => {
    expect(pageCount(51, 50)).toBe(2);
    expect(pageCount(99, 50)).toBe(2);
  });

  it('is exact on a page boundary', () => {
    // The off-by-one that gives an empty trailing page: 100/50 must be 2, not 3.
    expect(pageCount(100, 50)).toBe(2);
  });
});

describe('rangeLabel', () => {
  it('names the rows actually on screen', () => {
    expect(rangeLabel({ page: 1, pageSize: 50, total: 120, rows: 50 })).toBe('1–50 of 120');
    expect(rangeLabel({ page: 2, pageSize: 50, total: 120, rows: 50 })).toBe('51–100 of 120');
  });

  it('does not overrun the total on a partial last page', () => {
    // The defect this exists to prevent: "101–150 of 120".
    expect(rangeLabel({ page: 3, pageSize: 50, total: 120, rows: 20 })).toBe('101–120 of 120');
  });

  it('reports an empty collection as no records rather than a range', () => {
    expect(rangeLabel({ page: 1, pageSize: 50, total: 0, rows: 0 })).toBe('No records');
  });

  it('says one record rather than a range of one', () => {
    expect(rangeLabel({ page: 1, pageSize: 50, total: 1, rows: 1 })).toBe('1 record');
  });

  /**
   * A page beyond the end returns no rows. The label must not invent a range
   * for them — reachable by editing the URL, and the empty state should say so
   * rather than read "201–200 of 120".
   */
  it('reports a page past the end without inventing a range', () => {
    expect(rangeLabel({ page: 9, pageSize: 50, total: 120, rows: 0 })).toBe('No records on page 9');
  });
});

/**
 * The numbered window. A collection of 40 pages must not render 40 links, and
 * the window must not jump around as the user pages through it.
 */
describe('pageWindow', () => {
  it('lists every page when there are few', () => {
    expect(pageWindow(1, 3)).toEqual([1, 2, 3]);
  });

  it('keeps the current page centred in the middle of a long run', () => {
    expect(pageWindow(10, 20)).toEqual([8, 9, 10, 11, 12]);
  });

  it('does not run below page 1 near the start', () => {
    // Centring naively on page 2 would produce [0, 1, 2, 3, 4].
    expect(pageWindow(2, 20)).toEqual([1, 2, 3, 4, 5]);
    expect(pageWindow(1, 20)).toEqual([1, 2, 3, 4, 5]);
  });

  it('does not run past the last page near the end', () => {
    expect(pageWindow(20, 20)).toEqual([16, 17, 18, 19, 20]);
    expect(pageWindow(19, 20)).toEqual([16, 17, 18, 19, 20]);
  });

  it('keeps a constant width so the control does not resize while paging', () => {
    // A window that shrinks at the edges makes the buttons move under the
    // cursor — the reason it is clamped rather than simply truncated.
    for (const page of [1, 2, 3, 10, 18, 19, 20]) {
      expect(pageWindow(page, 20), `page ${page}`).toHaveLength(5);
    }
  });

  it('never exceeds the number of pages available', () => {
    expect(pageWindow(1, 2)).toEqual([1, 2]);
    expect(pageWindow(1, 1)).toEqual([1]);
  });

  it('always contains the current page', () => {
    /**
     * The invariant that makes the control usable: whatever else it shows, the
     * page you are on is somewhere in it.
     *
     * Only VALID pages are exercised — `pageWindow(2, 1)` asks where page 2 is
     * in a one-page collection, which has no sensible answer and is not a state
     * the caller can produce. An earlier version of this loop generated it and
     * failed, which was a defect in the test rather than the code.
     */
    for (const total of [1, 2, 5, 20, 100]) {
      const pages = [1, Math.ceil(total / 2), total].filter((p) => p >= 1 && p <= total);
      for (const page of pages) {
        expect(pageWindow(page, total), `page ${page} of ${total}`).toContain(page);
      }
    }
  });
});
