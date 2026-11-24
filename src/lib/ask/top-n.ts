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

/** Ranks from 1, ties taking their average rank, as Spearman's coefficient requires (24 Nov: miss rates are mostly tied at zero). */
export function averageRanks(xs: readonly number[]): number[] {
  const order = xs.map((x, i) => ({ x, i })).sort((p, q) => p.x - q.x);
  const ranks = new Array<number>(xs.length);
  for (let k = 0; k < order.length; ) {
    let j = k;
    while (j + 1 < order.length && order[j + 1].x === order[k].x) j += 1;
    const average = (k + j) / 2 + 1;
    for (let m = k; m <= j; m += 1) ranks[order[m].i] = average;
    k = j + 1;
  }
  return ranks;
}

/** Spearman's rank correlation: Pearson's coefficient on the average ranks. */
export function spearman(a: readonly number[], b: readonly number[]): number {
  const ra = averageRanks(a);
  const rb = averageRanks(b);
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;
  const ma = mean(ra);
  const mb = mean(rb);
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < ra.length; i += 1) { num += (ra[i] - ma) * (rb[i] - mb); da += (ra[i] - ma) ** 2; db += (rb[i] - mb) ** 2; }
  return num / Math.sqrt(da * db);
}

/**
 * A two-sided permutation p-value for Spearman's coefficient: the share of shuffles of `a` whose |rho| is at least the
 * observed one. Seeded, so a reported p repeats. A constant variable has no correlation to test, and answers 1.
 */
export function permutationP(a: readonly number[], b: readonly number[], shuffles: number, seed: number): number {
  const observed = Math.abs(spearman(a, b));
  if (!Number.isFinite(observed)) return 1;
  let state = seed >>> 0 || 1;
  const random = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  const shuffled = [...a];
  let atLeast = 0;
  for (let n = 0; n < shuffles; n += 1) {
    for (let i = shuffled.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    if (Math.abs(spearman(shuffled, b)) >= observed - 1e-12) atLeast += 1;
  }
  return atLeast / shuffles;
}

/**
 * **What a base could have shown (the coordinator, 24 Nov):** the |r| that would have cleared two-sided p < 0.05 at this
 * base, read off the same seeded shuffles as `permutationP`, the 95th percentile of the null's |r|. Null where a variable is
 * constant, since then no figure exists at all.
 */
export function criticalR(a: readonly number[], b: readonly number[], shuffles: number, seed: number): number | null {
  if (!Number.isFinite(spearman(a, b))) return null;
  let state = seed >>> 0 || 1;
  const random = () => { state ^= state << 13; state >>>= 0; state ^= state >>> 17; state ^= state << 5; state >>>= 0; return state / 4294967296; };
  const shuffled = [...a];
  const nulls: number[] = [];
  for (let n = 0; n < shuffles; n += 1) {
    for (let i = shuffled.length - 1; i > 0; i -= 1) { const j = Math.floor(random() * (i + 1)); [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]; }
    nulls.push(Math.abs(spearman(shuffled, b)));
  }
  nulls.sort((x, y) => x - y);
  return nulls[Math.ceil(0.95 * nulls.length) - 1];
}
