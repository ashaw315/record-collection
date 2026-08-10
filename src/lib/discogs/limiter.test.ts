import { describe, expect, it } from 'vitest';
import { TokenBucket } from './limiter';

/**
 * SPEC.md §6: "Rate limit: 60 requests/minute authenticated. Implement a
 * token-bucket limiter in a shared module that all Discogs calls route
 * through."
 *
 * The clock is INJECTED rather than faked globally. A limiter tested on real
 * timers takes a minute of wall-clock to prove a one-minute window and is
 * flaky under load; `vi.useFakeTimers` would work but couples every test to
 * timer internals, and this class has no timers — it computes from elapsed
 * time, which is a pure function of the clock.
 *
 * `waitMs` returns how long the caller must wait rather than sleeping itself,
 * for the same reason: a module that sleeps cannot be tested without waiting.
 */

/** A clock the test drives by hand. */
function clockAt(start = 0) {
  let now = start;
  return {
    now: () => now,
    advance: (ms: number) => {
      now += ms;
    },
  };
}

const PER_MINUTE = 60;
const MINUTE = 60_000;

describe('TokenBucket', () => {
  it('allows a request when tokens remain', () => {
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: PER_MINUTE, refillMs: MINUTE, now: clock.now });

    expect(bucket.waitMs()).toBe(0);
  });

  it('allows exactly the capacity before making anyone wait', () => {
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: PER_MINUTE, refillMs: MINUTE, now: clock.now });

    for (let i = 0; i < PER_MINUTE; i += 1) {
      expect(bucket.waitMs(), `request ${i + 1} of ${PER_MINUTE}`).toBe(0);
      bucket.take();
    }

    // The 61st in the same minute is the one Discogs would reject.
    expect(bucket.waitMs()).toBeGreaterThan(0);
  });

  it('makes the caller wait only until the next token, not a whole window', () => {
    /**
     * The discriminating case for the refill rule. A bucket that refills all 60
     * tokens once per minute and one that drips a token every second both
     * "allow 60 per minute" — but the first makes the 61st caller wait the rest
     * of the minute, and the second lets it through a second later.
     *
     * §6 says 60/minute, and the drip is the correct reading: it is what keeps
     * a burst of imports moving instead of stalling for up to a minute.
     */
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: PER_MINUTE, refillMs: MINUTE, now: clock.now });

    for (let i = 0; i < PER_MINUTE; i += 1) bucket.take();

    const wait = bucket.waitMs();
    expect(wait).toBeGreaterThan(0);
    expect(wait, 'one token drips every second, so the wait is ~1s not ~60s').toBeLessThanOrEqual(
      MINUTE / PER_MINUTE,
    );
  });

  it('refills over time', () => {
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: PER_MINUTE, refillMs: MINUTE, now: clock.now });

    for (let i = 0; i < PER_MINUTE; i += 1) bucket.take();
    expect(bucket.waitMs()).toBeGreaterThan(0);

    clock.advance(MINUTE / PER_MINUTE);

    expect(bucket.waitMs(), 'one token has dripped back').toBe(0);
  });

  it('never accumulates more than capacity while idle', () => {
    /**
     * Without a ceiling, an idle limiter banks tokens and the next burst sends
     * hundreds of requests at once — the limiter would be worse than none,
     * because it would look like it was working.
     */
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: PER_MINUTE, refillMs: MINUTE, now: clock.now });

    clock.advance(MINUTE * 10);

    let allowed = 0;
    while (bucket.waitMs() === 0 && allowed < PER_MINUTE * 5) {
      bucket.take();
      allowed += 1;
    }

    expect(allowed, 'ten idle minutes must not bank ten minutes of tokens').toBe(PER_MINUTE);
  });

  it('does not go negative when take() outruns the tokens', () => {
    // take() is called by the client after waiting; a caller that ignores the
    // wait must not be able to drive the bucket into a state it never recovers
    // from.
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: 2, refillMs: MINUTE, now: clock.now });

    for (let i = 0; i < 50; i += 1) bucket.take();

    clock.advance(MINUTE);

    // A full window has passed: the bucket is full again, not 48 in debt.
    let allowed = 0;
    while (bucket.waitMs() === 0 && allowed < 10) {
      bucket.take();
      allowed += 1;
    }
    expect(allowed).toBe(2);
  });

  it('can be told to wait until a specific time, for Retry-After', () => {
    /**
     * §6: "On 429, respect `Retry-After`." Discogs' own limiter is the
     * authority when it disagrees with ours — our accounting can drift from
     * theirs, and theirs is the one that returns errors.
     */
    const clock = clockAt(1_000);
    const bucket = new TokenBucket({ capacity: PER_MINUTE, refillMs: MINUTE, now: clock.now });

    bucket.blockUntil(clock.now() + 5_000);

    expect(bucket.waitMs()).toBe(5_000);

    clock.advance(5_000);
    expect(bucket.waitMs()).toBe(0);
  });

  it('keeps the longer of its own wait and an external block', () => {
    // A Retry-After shorter than our own backpressure must not shorten it.
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: 1, refillMs: MINUTE, now: clock.now });

    bucket.take();
    const ownWait = bucket.waitMs();
    expect(ownWait).toBeGreaterThan(0);

    bucket.blockUntil(clock.now() + 1);

    expect(bucket.waitMs()).toBe(ownWait);
  });
});

describe('reserving a token, rather than checking then taking', () => {
  /**
   * THE RACE the security review found, and the reason every test above is
   * insufficient: they are all SEQUENTIAL, so `waitMs()` and `take()` are
   * never interleaved by another caller.
   *
   * Measured before the fix, with 200 concurrent `client.get()` against a
   * 60/minute bucket: `maxInFlight: 200`. Every caller checked a full bucket
   * before any of them spent a token — a complete bypass, not a partial one.
   *
   * `reserve()` does both in one synchronous step, so a caller holds its token
   * before it releases control.
   */
  it('hands out at most `capacity` reservations without waiting', () => {
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: PER_MINUTE, refillMs: MINUTE, now: clock.now });

    const waits = Array.from({ length: 200 }, () => bucket.reserve());
    const free = waits.filter((wait) => wait === 0);

    expect(free, 'only the bucket capacity may go without waiting').toHaveLength(PER_MINUTE);
  });

  it('makes each caller beyond capacity wait progressively longer', () => {
    /**
     * The 61st waits for one token to drip, the 62nd for two. A limiter that
     * returned the same wait to every over-capacity caller would release them
     * all at once — the same stampede in slower motion.
     */
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: 2, refillMs: MINUTE, now: clock.now });

    bucket.reserve();
    bucket.reserve();

    const third = bucket.reserve();
    const fourth = bucket.reserve();

    expect(third).toBeGreaterThan(0);
    expect(fourth, 'the queue is ordered, not simultaneous').toBeGreaterThan(third);
  });

  it('reserves under genuine concurrency, not merely in a loop', async () => {
    /**
     * The loop above proves the arithmetic; this proves the ATOMICITY. Every
     * caller yields between reserving and reporting, which is exactly the
     * window the old check-then-act shape left open.
     */
    const clock = clockAt();
    const bucket = new TokenBucket({ capacity: 10, refillMs: MINUTE, now: clock.now });

    const results = await Promise.all(
      Array.from({ length: 50 }, async () => {
        const wait = bucket.reserve();
        await new Promise((resolve) => setImmediate(resolve));
        return wait;
      }),
    );

    expect(results.filter((wait) => wait === 0)).toHaveLength(10);
  });

  it('still honours an external block', () => {
    // §6's Retry-After outranks our own accounting, reservation or not.
    const clock = clockAt(1_000);
    const bucket = new TokenBucket({ capacity: PER_MINUTE, refillMs: MINUTE, now: clock.now });

    bucket.blockUntil(clock.now() + 5_000);

    expect(bucket.reserve()).toBe(5_000);
  });
});
