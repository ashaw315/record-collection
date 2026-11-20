/**
 * The summary a timing is pinned from (Q72, the coordinator, 19 Nov): the count, the least, the middle value, the
 * nearest-rank p90 and the most. Every figure is a value from the sample: a p90 by nearest rank never exceeds the
 * maximum and never interpolates, which is what a duration pinned "from the p90 with room" needs. An empty sample has
 * no figures, not zeros. `test/repo/measure-summary.test.ts` holds it.
 * @param {readonly number[]} values
 * @returns {{ n: number, min: number | null, median: number | null, p90: number | null, max: number | null }}
 */
export function summarize(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const n = sorted.length;
  if (n === 0) return { n: 0, min: null, median: null, p90: null, max: null };
  const median = n % 2 === 1 ? sorted[(n - 1) / 2] : (sorted[n / 2 - 1] + sorted[n / 2]) / 2;
  const p90 = sorted[Math.ceil(0.9 * n) - 1];
  return { n, min: sorted[0], median, p90, max: sorted[n - 1] };
}
