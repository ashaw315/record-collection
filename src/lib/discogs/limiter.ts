/**
 * A token bucket for the Discogs rate limit (SPEC.md §6: 60 requests/minute
 * authenticated).
 *
 * Tokens DRIP rather than refilling in one lump: `capacity` tokens per
 * `refillMs`, replenished continuously. Both readings satisfy "60 per minute",
 * and the difference is what the 61st caller experiences — a lump refill stalls
 * it for the remainder of the minute, while the drip lets it through about a
 * second later. An import walking a master's versions is a burst of exactly
 * that shape, so the drip is the reading that keeps the app usable.
 *
 * The clock is injected and nothing here sleeps: `waitMs()` reports how long
 * the caller must wait and leaves the waiting to them. A module that slept
 * could not be tested without a test that also slept.
 */

export type TokenBucketOptions = {
  capacity: number;
  refillMs: number;
  now?: () => number;
};

export class TokenBucket {
  private readonly capacity: number;
  private readonly refillMs: number;
  private readonly now: () => number;

  /** Fractional: a partly-refilled token is a real state, not a rounding error. */
  private tokens: number;
  private lastRefill: number;

  /**
   * When Discogs has told us to back off (§6's `Retry-After`). Their limiter is
   * the authority when it disagrees with ours — our accounting can drift from
   * theirs, and theirs is the one that returns 429s.
   */
  private blockedUntil = 0;

  constructor(options: TokenBucketOptions) {
    this.capacity = options.capacity;
    this.refillMs = options.refillMs;
    this.now = options.now ?? Date.now;
    this.tokens = options.capacity;
    this.lastRefill = this.now();
  }

  private refill(): void {
    const at = this.now();
    const elapsed = at - this.lastRefill;
    if (elapsed <= 0) return;

    const perMs = this.capacity / this.refillMs;
    // Capped at capacity: without this an idle limiter banks tokens and the
    // next burst fires them all at once, which is worse than no limiter because
    // it still looks like one.
    this.tokens = Math.min(this.capacity, this.tokens + elapsed * perMs);
    this.lastRefill = at;
  }

  /** Milliseconds the caller must wait before spending a token. 0 when free. */
  waitMs(): number {
    this.refill();

    const backoff = Math.max(0, this.blockedUntil - this.now());
    if (this.tokens >= 1) return backoff;

    const perMs = this.capacity / this.refillMs;
    const ownWait = Math.ceil((1 - this.tokens) / perMs);

    // The LONGER of the two. A short Retry-After must not shorten our own
    // backpressure, and our own must not shorten a long Retry-After.
    return Math.max(ownWait, backoff);
  }

  /** Spends a token. Floors at zero so an impatient caller cannot bank debt. */
  take(): void {
    this.refill();
    this.tokens = Math.max(0, this.tokens - 1);
  }

  /**
   * Claims a token and reports how long the caller must wait before using it.
   *
   * **This is the atomic form, and it exists because `waitMs()` then `take()`
   * is check-then-act.** With an `await` between them — which the client needs,
   * because waiting is asynchronous — every concurrent caller checks a full
   * bucket before any of them spends anything. Measured: 200 concurrent
   * requests against a 60/minute bucket ran 200 in flight. Not a partial
   * bypass; a complete one, on the ordinary path, since both
   * `matchOwnershipForResults` and the versions endpoint fan out with
   * `Promise.all`.
   *
   * `reserve()` does both in ONE SYNCHRONOUS STEP. JavaScript will not
   * interleave another caller inside it, so a caller holds its token before it
   * releases control and the 61st waits for the 61st token rather than for the
   * first.
   *
   * The debt is deliberate: tokens go negative here, and that is what makes
   * each over-capacity caller wait longer than the last. Releasing them all at
   * the same moment would be the same stampede in slower motion.
   */
  reserve(): number {
    this.refill();

    const perMs = this.capacity / this.refillMs;
    const backoff = Math.max(0, this.blockedUntil - this.now());

    // The token this caller is taking. Negative means it is queued behind
    // others, and how far behind decides its wait.
    this.tokens -= 1;

    const ownWait = this.tokens >= 0 ? 0 : Math.ceil(-this.tokens / perMs);

    return Math.max(ownWait, backoff);
  }

  /** Honour a `Retry-After`. Never shortens an existing, longer block. */
  blockUntil(timestamp: number): void {
    this.blockedUntil = Math.max(this.blockedUntil, timestamp);
  }
}
