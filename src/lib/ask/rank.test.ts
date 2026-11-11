import { describe, expect, it } from 'vitest';
import { cosine, rankByNearness } from './rank';

/**
 * **Q22's ranking, the pure part (§P.2 as it stands; the coordinator, 11 Nov).** The pool is ranked by nearness of each
 * ABOUT's stored vector to the phrase's; the answer is the nearest three to five; a re-ask leaves out the last answer's
 * records while enough remain; a record asked from by title is left out of its own answers. Each case fails against a
 * cosine that ignores magnitude, a rank in the wrong direction, an exclusion applied when too few remain, or one that
 * fails to leave the asked-from record out.
 */
describe('cosine', () => {
  it('is 1 for the same direction, 0 for orthogonal, -1 for opposite, and ignores magnitude', () => {
    expect(cosine([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosine([1, 0], [0, 1])).toBeCloseTo(0);
    expect(cosine([1, 0], [-2, 0])).toBeCloseTo(-1);
    expect(cosine([1, 1], [3, 3])).toBeCloseTo(1);
  });

  it('is 0 against a zero vector rather than NaN', () => {
    expect(cosine([0, 0], [1, 0])).toBe(0);
  });
});

describe('rankByNearness', () => {
  const pool = [
    { recordId: 'a', vector: [1, 0] },
    { recordId: 'b', vector: [0.9, 0.1] },
    { recordId: 'c', vector: [0, 1] },
    { recordId: 'd', vector: [0.5, 0.5] },
    { recordId: 'e', vector: [-1, 0] },
  ];

  it('orders the pool nearest first and takes the number asked for, with each answer’s nearness', () => {
    const answers = rankByNearness([1, 0], pool, { take: 3 });
    expect(answers.map((r) => r.recordId)).toEqual(['a', 'b', 'd']);
    expect(answers[0].nearness).toBeCloseTo(1);
    expect(answers[2].nearness).toBeCloseTo(Math.SQRT1_2);
  });

  it('leaves out the last answer’s records while enough remain, and ignores the exclusion when too few would', () => {
    expect(rankByNearness([1, 0], pool, { take: 3, exclude: ['a', 'b'] }).map((r) => r.recordId)).toEqual(['d', 'c', 'e']);
    /* Five in the pool, four excluded: one would remain against three asked for, so the whole pool is ranked again. */
    expect(rankByNearness([1, 0], pool, { take: 3, exclude: ['a', 'b', 'c', 'd'] }).map((r) => r.recordId)).toEqual(['a', 'b', 'd']);
  });

  it('leaves the record asked from out of its own answers, always', () => {
    const answers = rankByNearness([1, 0], pool, { take: 3, askedFrom: 'a' });
    expect(answers.map((r) => r.recordId)).toEqual(['b', 'd', 'c']);
    /* Asked from and the exclusion together: the asked-from record never returns, whatever remains. */
    expect(rankByNearness([1, 0], pool, { take: 3, askedFrom: 'a', exclude: ['b', 'c', 'd', 'e'] }).map((r) => r.recordId)).toEqual(['b', 'd', 'c']);
  });

  it('answers with fewer than asked when the pool holds fewer, and with none from an empty pool', () => {
    expect(rankByNearness([1, 0], pool.slice(0, 2), { take: 5 }).map((r) => r.recordId)).toEqual(['a', 'b']);
    expect(rankByNearness([1, 0], [], { take: 3 })).toEqual([]);
  });
});
