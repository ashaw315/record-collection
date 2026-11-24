import { cosine } from './rank';

/**
 * **Design's top-N measurement (23 Nov): the price of bounding the pick's pool to the ranking's nearest N.** For an
 * answer, each picked record's rank among the whole pool by the nearness of its matched text to the phrase, ties broken
 * by id as `rankByNearness` breaks them; then, across every answer, the share of picks ranked beyond N. Over picks, not
 * answers: a bound that loses one record of five has cost one pick.
 */
export function ranksOfPicks(query: number[], pool: ReadonlyArray<{ recordId: string; vector: number[] }>, picked: readonly string[]): Array<{ recordId: string; rank: number }> {
  const order = pool
    .map((c) => ({ recordId: c.recordId, nearness: cosine(query, c.vector) }))
    .sort((a, b) => b.nearness - a.nearness || a.recordId.localeCompare(b.recordId))
    .map((c) => c.recordId);
  return picked.map((recordId) => ({ recordId, rank: order.indexOf(recordId) + 1 }));
}

export function outsideTopN(answers: ReadonlyArray<ReadonlyArray<{ rank: number }>>, n: number): { outside: number; picks: number; share: number } {
  const ranks = answers.flat();
  const outside = ranks.filter((r) => r.rank > n).length;
  return { outside, picks: ranks.length, share: ranks.length === 0 ? 0 : outside / ranks.length };
}
