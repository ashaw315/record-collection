/**
 * Each worker's requests, kept so a reset one can say what came before it.
 * Read by `e2e/reset-evidence.ts`; see `test/repo/reset-evidence.test.ts`
 * for why.
 */
const ordinal = (n: number) => `${n}${n % 100 >= 11 && n % 100 <= 13 ? 'th' : ['th', 'st', 'nd', 'rd'][n % 10] ?? 'th'}`;

export class RequestLog {
  private readonly workers = new Map<number, { last: number; count: number }>();

  /** A request the worker made, at `time` in milliseconds. */
  request(worker: number, time: number): void {
    const seen = this.workers.get(worker);
    this.workers.set(worker, { last: time, count: (seen?.count ?? 0) + 1 });
  }

  /** The line for a request that was reset; the request is counted too. */
  reset(worker: number, time: number, what: string): string {
    const seen = this.workers.get(worker);
    this.request(worker, time);
    if (seen === undefined) return `[reset] worker ${worker}: ${what} reset on the worker’s first request`;
    return `[reset] worker ${worker}: ${what} reset ${Math.round(time - seen.last)}ms after the worker’s last request, its ${ordinal(seen.count + 1)}; ${seen.count} had gone before`;
  }
}
