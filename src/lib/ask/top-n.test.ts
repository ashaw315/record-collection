import { describe, expect, it } from 'vitest';
import { criticalR, negationReading, outsideTopN, permutationP, ranksOfPicks, spearman } from './top-n';

/**
 * **Design's top-N measurement, its arithmetic (23 Nov):** for each answer, each picked record's rank among the pool by
 * nearness of its matched text to the phrase, and the share of picks that fall outside the top N. Fails against a rank
 * counted from zero, ties broken other than as the route breaks them (by id), and a share over answers rather than picks.
 */
describe('ranksOfPicks', () => {
  it('ranks the pool by nearness to the phrase, nearest first and ties by id as rankByNearness does, and reads each pick’s rank from 1', () => {
    const pool = [
      { recordId: 'c', vector: [1, 0] },
      { recordId: 'a', vector: [0, 1] },
      { recordId: 'b', vector: [1, 0] },
      { recordId: 'd', vector: [0.6, 0.8] },
    ];
    expect(ranksOfPicks([1, 0], pool, ['b', 'a', 'd'])).toEqual([
      { recordId: 'b', rank: 1 },
      { recordId: 'a', rank: 4 },
      { recordId: 'd', rank: 3 },
    ]);
  });
});

describe('outsideTopN', () => {
  it('is the share of all picks, across every answer, ranked beyond N', () => {
    const answers = [[{ rank: 1 }, { rank: 12 }], [{ rank: 25 }, { rank: 3 }, { rank: 31 }]];
    expect(outsideTopN(answers, 10)).toEqual({ outside: 3, picks: 5, share: 0.6 });
    expect(outsideTopN(answers, 30)).toEqual({ outside: 1, picks: 5, share: 0.2 });
    expect(outsideTopN([], 10)).toEqual({ outside: 0, picks: 0, share: 0 });
  });
});

describe('spearman', () => {
  /* Ties take their average rank (24 Nov): miss rates are mostly zero, and ranking ties by list order made the figure depend on the order records happened to be listed in. Fails against sequential ranks for ties and against a sign that does not flip with the other variable. */
  it('gives tied values their average rank, and flips sign exactly when one variable is negated', () => {
    const a = [0, 0, 0, 1, 0.5];
    const b = [3, 1, 2, 5, 4];
    const r = spearman(a, b);
    /* Average ranks [2, 2, 2, 5, 4] against [3, 1, 2, 5, 4]: 8 over the root of 8 × 10. */
    expect(r).toBeCloseTo(8 / Math.sqrt(80), 10);
    expect(spearman(a, b.map((x) => -x))).toBeCloseTo(-r, 10);
    expect(spearman([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
  });
});

describe('permutationP', () => {
  /* With most rates tied at zero the usual significance line assumes too much (24 Nov), so the chance of a correlation as strong is read by shuffling one variable. Fails against a p that does not shrink for a perfect relation, or one that is not 1 where the variable is constant. */
  it('is small for a perfect relation, near one where there is none, and seeded so a run repeats', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    expect(permutationP(xs, xs, 2000, 7)).toBeLessThan(0.01);
    expect(permutationP(xs.map(() => 0), xs, 500, 7)).toBe(1);
    expect(permutationP(xs, xs, 500, 7)).toBe(permutationP(xs, xs, 500, 7));
  });
});

describe('criticalR', () => {
  /* The coordinator, 24 Nov: "not supported" arrives with what could have been seen, the |r| that would have cleared p < 0.05 at the base's n, read off the same shuffles. Fails against a percentile taken at the wrong end, one-sided, or not of the absolute value: for 20 untied values the tabled two-sided 0.05 value is about 0.447. */
  it('is the |r| a shuffle reaches only 5% of the time, two-sided, agreeing with the tabled value for 20 untied ranks', () => {
    const xs = Array.from({ length: 20 }, (_, i) => i);
    const c = criticalR(xs, xs, 20000, 7);
    expect(c).toBeGreaterThan(0.42);
    expect(c).toBeLessThan(0.48);
  });
  it('rises as the base shrinks, and is null where a variable is constant and no figure exists', () => {
    const small = Array.from({ length: 8 }, (_, i) => i);
    const large = Array.from({ length: 40 }, (_, i) => i);
    expect(criticalR(small, small, 5000, 7) ?? 0).toBeGreaterThan(criticalR(large, large, 5000, 7) ?? 1);
    expect(criticalR(small.map(() => 0), small, 500, 7)).toBeNull();
  });
});

/*
 * The negation test's reading rule (PREREGISTRATION-negation.md, 25 Nov), fixed before the run. Ordering only (the
 * coordinator, 25 Nov): the reading compares each record's rank under "instrumental" with its rank under "no vocals" and
 * nothing else. No bound appears here, so no case below can turn on where 30 falls.
 */
describe('negationReading', () => {
  const rec = (instrumental: number, noVocals: number, unstable = false) => ({ instrumental, noVocals, unstable });

  it('reads consistent when all four rank shallower under "instrumental" than under "no vocals"', () => {
    expect(negationReading([rec(3, 40), rec(44, 45), rec(46, 47), rec(49, 50)])).toBe('consistent');
  });

  it('reads not consistent when any one record is not shallower, equal rank included', () => {
    expect(negationReading([rec(3, 40), rec(8, 45), rec(12, 47), rec(51, 50)])).toBe('not consistent');
    expect(negationReading([rec(3, 40), rec(8, 45), rec(12, 47), rec(50, 50)])).toBe('not consistent');
  });

  it('lets an unstable record meet no reading: undetermined unless a stable record already refutes', () => {
    expect(negationReading([rec(3, 40), rec(8, 45), rec(12, 47, true), rec(20, 50)])).toBe('undetermined');
    expect(negationReading([rec(3, 40), rec(8, 45), rec(12, 47, true), rec(51, 50)])).toBe('not consistent');
  });

  it('refuses anything but the four records', () => {
    expect(() => negationReading([rec(3, 40), rec(8, 45), rec(12, 47)])).toThrow(/four/);
  });
});
