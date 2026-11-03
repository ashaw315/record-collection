import { describe, expect, it } from 'vitest';
import { classify, summarise, type Row } from './release-year-backfill';

/**
 * §4.2: release_year is the album's original year, and every writer of it wrote the pressing's
 * until 2 Nov. The backfill writes only where the record is a reissue and its year is empty or the
 * pressing's, because those are the ones the writers set wrongly; a hand-set year, or a non-reissue,
 * is a person's value or a flag's claim, and a difference there is a finding, not a write.
 */
const row = (over: Partial<Row> = {}): Row => ({ id: 'r', title: 'T', isReissue: true, releaseYear: 2024, yearPressed: 2024, masterId: 5, ...over });

describe('classify', () => {
  it('writes the master’s year to a reissue holding the pressing’s year', () => {
    expect(classify(row(), 1969)).toEqual({ kind: 'write', year: 1969 });
  });

  it('writes the master’s year to a reissue with no year', () => {
    expect(classify(row({ releaseYear: null }), 1996)).toEqual({ kind: 'write', year: 1996 });
  });

  it('leaves a reissue whose year was set by hand, and reports the master if it differs', () => {
    expect(classify(row({ releaseYear: 1994, yearPressed: 2024 }), 1994)).toEqual({ kind: 'right' });
    expect(classify(row({ releaseYear: 1994, yearPressed: 2024 }), 1993)).toEqual({ kind: 'hand-set-differs', master: 1993 });
  });

  it('leaves a non-reissue alone, and reports a master that disagrees as a finding about the flag', () => {
    expect(classify(row({ isReissue: false, releaseYear: 1970, yearPressed: 1970 }), 1970)).toEqual({ kind: 'right' });
    expect(classify(row({ isReissue: false, releaseYear: 1970, yearPressed: 1970 }), 1966)).toEqual({ kind: 'flag-suspect', master: 1966 });
  });

  it('does nothing without an answer from the master', () => {
    expect(classify(row(), null)).toEqual({ kind: 'no-answer' });
    expect(classify(row({ masterId: null }), null)).toEqual({ kind: 'no-master' });
  });

  it('calls a reissue whose master agrees already right', () => {
    expect(classify(row({ releaseYear: 2024, yearPressed: 2024 }), 2024)).toEqual({ kind: 'right' });
  });
});

describe('summarise', () => {
  it('leads with the records whose page claims a false same year, then in scope, then out', () => {
    const rows = [row({ id: 'a', title: 'A' }), row({ id: 'b', title: 'B', isReissue: false, releaseYear: 1970, yearPressed: 1970 }), row({ id: 'c', title: 'C', releaseYear: null, yearPressed: null })];
    const s = summarise(rows, new Map([['a', 1969], ['b', 1966], ['c', 1996]]));
    expect(s.falseSameYear.map((r) => r.title)).toEqual(['A']);
    expect(s.write.map((r) => `${r.title} ${r.year}`)).toEqual(['A 1969', 'C 1996']);
    expect(s.outOfScope.map((r) => r.title)).toEqual(['B']);
  });
});
