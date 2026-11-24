import { describe, expect, it } from 'vitest';
import { outsideTopN, ranksOfPicks } from './top-n';

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
