import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { getDb } from '@/db/client';
import { llmRequests } from '@/db/schema';
import { claimLlmRequest, LLM_REQUESTS_PER_HOUR } from '@/lib/llm/rate-limit';

/**
 * SPEC.md §4.3 `llm_requests` and §9.2's "rate limit to 10 requests/hour,
 * enforced server-side".
 *
 * **The whole point of this module is the atomic claim**, so the tests are
 * shaped around the concurrent case rather than the sequential one. A11's own
 * wording: a `SELECT count(*)` followed by an `INSERT` is check-then-act, and
 * two concurrent requests both read 9, both pass, and both write.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

const countRows = async () => {
  const result = await db.execute<{ n: number }>(sql`SELECT COUNT(*)::int AS n FROM llm_requests`);
  return result.rows[0].n;
};

/** Rows inside the window, aged so they are genuinely "this hour". */
async function fill(n: number, minutesAgo = 1) {
  if (n === 0) return;
  await db.insert(llmRequests).values(
    Array.from({ length: n }, () => ({
      kind: 'gap_analysis',
      requestedAt: new Date(Date.now() - minutesAgo * 60_000),
    })),
  );
}

describe('claiming a request', () => {
  /**
   * Fails against: a claim that never inserts, or one that reports failure on an
   * empty table.
   */
  it('admits a request against an empty window and records it', async () => {
    const claim = await claimLlmRequest('gap_analysis');

    expect(claim.ok).toBe(true);
    expect(await countRows()).toBe(1);
  });

  /**
   * Fails against: a limit other than 10, and against an off-by-one that admits
   * the eleventh.
   *
   * Pinned from both sides — the tenth is admitted and the eleventh is not —
   * because either assertion alone is satisfied by a bound off by one in the
   * permissive direction, which is the mistake this shape invites.
   */
  it('admits the tenth request and refuses the eleventh', async () => {
    await fill(LLM_REQUESTS_PER_HOUR - 1);

    const tenth = await claimLlmRequest('gap_analysis');
    expect(tenth.ok).toBe(true);

    const eleventh = await claimLlmRequest('gap_analysis');
    expect(eleventh.ok).toBe(false);
    expect(await countRows()).toBe(LLM_REQUESTS_PER_HOUR);
  });

  /**
   * Fails against: a refusal that writes a row anyway.
   *
   * A refused request must not consume capacity — otherwise a user who keeps
   * retrying pushes their own window forward and never recovers, which is a
   * rate limit that gets stricter the more it is hit.
   */
  it('a refused claim writes nothing', async () => {
    await fill(LLM_REQUESTS_PER_HOUR);

    const refused = await claimLlmRequest('gap_analysis');

    expect(refused.ok).toBe(false);
    expect(await countRows()).toBe(LLM_REQUESTS_PER_HOUR);
  });

  /**
   * Fails against: a window that counts all rows regardless of age.
   *
   * Rows older than the hour must not count. Without this the limiter is a
   * lifetime quota of ten, which passes every sequential test above.
   */
  it('rows outside the window do not count', async () => {
    await fill(LLM_REQUESTS_PER_HOUR, 61);

    const claim = await claimLlmRequest('gap_analysis');

    expect(claim.ok).toBe(true);
  });

  /**
   * Fails against: separate budgets per `kind`.
   *
   * §4.3: both callers spend the same account, so two independent 10/hour
   * limits would be a 20/hour limit nobody specified. Ten snippets must exhaust
   * the budget a gap analysis draws on.
   */
  it('the two kinds share one budget', async () => {
    await db.insert(llmRequests).values(
      Array.from({ length: LLM_REQUESTS_PER_HOUR }, () => ({
        kind: 'snippet',
        requestedAt: new Date(),
      })),
    );

    const claim = await claimLlmRequest('gap_analysis');

    expect(claim.ok).toBe(false);
  });

  /**
   * Fails against: a refusal that cannot say when capacity returns.
   *
   * §9.2 requires a legible refusal rather than a 500 or silence. "Try later"
   * with no time is the same non-answer as a bare error — the app knows when
   * the oldest row in the window ages out, so it can say.
   */
  it('a refusal names when capacity returns', async () => {
    const oldest = new Date(Date.now() - 30 * 60_000);
    await db.insert(llmRequests).values(
      Array.from({ length: LLM_REQUESTS_PER_HOUR }, () => ({
        kind: 'gap_analysis',
        requestedAt: oldest,
      })),
    );

    const refused = await claimLlmRequest('gap_analysis');

    expect(refused.ok).toBe(false);
    if (refused.ok) throw new Error('unreachable');
    // The oldest row ages out an hour after it was made: ~30 minutes from now.
    const minutes = (refused.retryAt.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(25);
    expect(minutes).toBeLessThan(35);
  });
});

describe('the concurrent claim', () => {
  /**
   * **THE test for this module, and the one most easily written wrong.**
   *
   * A sequential version — claim, await, claim again, expect refusal — passes
   * with the atomic guard REMOVED, because the first claim has committed by the
   * time the second reads. NOTES records that shape as the acquire-flow race,
   * and this is the same defect one table over.
   *
   * Two promises in flight is necessary and NOT sufficient either: under load
   * the first can finish before the second begins, and the test silently becomes
   * the sequential one it was written to replace.
   *
   * **So both callers are forced past the point the guard defends.** The read is
   * hooked, and neither is released until both have arrived — a barrier, not a
   * delay, so the interleaving is guaranteed rather than likely.
   *
   * **The hook intercepts the FIRST call only** (NOTES' rule: a mock that
   * intercepts every call disables the function, one that intercepts the first
   * simulates the race). Here that matters concretely — the claim reads inside
   * its statement, so a permanent hook would break the retry path and the test
   * would report a crash where the defect is a double-write.
   */
  it('two simultaneous claims for the last slot admit exactly one', async () => {
    await fill(LLM_REQUESTS_PER_HOUR - 1);

    /**
     * **The barrier sits between the READ and the WRITE, which is the only
     * place it works.** Two earlier versions did not, and both are recorded
     * because each looked correct:
     *
     * 1. **A JS barrier before the call.** Both callers announce arrival, the
     *    second releases both, then each calls `claimLlmRequest`. Caught the
     *    check-then-act mutation alone (3/3) and MISSED it in the full file
     *    (3/3) — the six sequential tests before it warm the connection pool, so
     *    the first claim's round-trip finishes before the second issues its
     *    query. Measured: running only the two concurrent tests, it failed
     *    again.
     * 2. **`pg_advisory_xact_lock` around each claim.** This made it worse. The
     *    lock SERIALISES — A claims, commits, releases; B then reads A's row —
     *    which is the sequential case the test exists to avoid. It stopped
     *    catching the mutation entirely.
     *
     * The defect is two callers both READING before either WRITES, so the
     * barrier must sit in that window. `db.execute` is hooked, and a caller that
     * has finished its count waits until BOTH have finished theirs. Under
     * check-then-act, both then see 9 and both insert — the eleventh request,
     * admitted.
     *
     * **The hook intercepts the count query only and passes everything else
     * through** (NOTES' rule: a mock intercepting every call disables the
     * function; one intercepting the first simulates the race). A blanket hook
     * would stall the inserts against each other and the test would report a
     * timeout where the defect is a double-write.
     *
     * Against the CORRECT implementation the claim serialises on an advisory
     * lock, so the second caller's count runs after the first has committed, the
     * barrier's second arrival never happens, and the 2s race-timeout releases
     * it — which is why this passes when the code is right.
     *
     * **A later finding this test's comment must not overstate.** Once the
     * advisory lock is in place, splitting the statement back into a count and
     * an insert INSIDE the lock is no longer a defect — the lock is what makes
     * it safe, so that mutation correctly passes. What this test constrains is
     * that a claim cannot read stale state and write anyway; it does not
     * constrain the statement's shape, and it should not be described as though
     * it did.
     */
    let counted = 0;
    let releaseBoth!: () => void;
    const bothCounted = new Promise<void>((resolve) => {
      releaseBoth = resolve;
    });

    /*
     * **The MODULE's handle, not the test's.** `getDb()` caches its own client
     * and `getTestDb()` builds a separate Drizzle instance over the same
     * database, so spying on the test's handle intercepts nothing the module
     * does — measured with a probe after the first hooked version silently
     * failed to fire.
     */
    const moduleDb = getDb();
    const realExecute = moduleDb.execute.bind(moduleDb);
    /*
     * `execute` returns Drizzle's thenable `PgRaw`, not a plain promise, so the
     * spy is installed through a cast rather than by matching that type. The
     * cast is confined to this line: what the barrier needs is to await the real
     * call and delay its resolution, and the awaited VALUE is passed straight
     * back.
     */
    const hook = async (query: Parameters<typeof realExecute>[0]) => {
      const result = await realExecute(query);

      // Only the check-then-act SELECT: a COUNT that is not part of an INSERT.
      const text = JSON.stringify(query).toLowerCase();
      if (text.includes('count(*)') && !text.includes('insert')) {
        counted += 1;
        if (counted === 2) releaseBoth();
        if (counted <= 2) {
          await Promise.race([
            bothCounted,
            new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
          ]);
        }
      }

      return result;
    };

    vi.spyOn(moduleDb, 'execute').mockImplementation(
      hook as unknown as typeof moduleDb.execute,
    );

    const [first, second] = await Promise.all([
      claimLlmRequest('gap_analysis'),
      claimLlmRequest('gap_analysis'),
    ]);

    vi.restoreAllMocks();

    const admitted = [first, second].filter((claim) => claim.ok);

    expect(admitted).toHaveLength(1);
    expect(await countRows()).toBe(LLM_REQUESTS_PER_HOUR);
  });

  /**
   * Ten claimants against nine free slots: exactly nine may be admitted.
   *
   * **The barrier is what makes this deterministic**, and it was added after
   * measurement rather than by design. Firing ten claims with a bare
   * `Promise.all` DID find the missing-lock defect — but only 4 runs in 6, and a
   * detector that misses a third of the time reads as flake and gets retried
   * away. The race it depends on is real concurrency, so its timing varies with
   * pool warmth and machine load.
   *
   * Holding every claimant at the same point removes the timing from the
   * question: all ten count before any inserts, which is precisely the state a
   * limiter without the advisory lock mishandles — under READ COMMITTED each
   * sees the same nine committed rows and each concludes there is room.
   */
  it('ten simultaneous claims against nine slots admit exactly nine', async () => {
    await fill(LLM_REQUESTS_PER_HOUR - 9);

    const CLAIMANTS = 10;
    let counted = 0;
    let releaseAll!: () => void;
    const allCounted = new Promise<void>((resolve) => {
      releaseAll = resolve;
    });

    const moduleDb = getDb();
    const realExecute = moduleDb.execute.bind(moduleDb);
    const hook = async (query: Parameters<typeof realExecute>[0]) => {
      const text = JSON.stringify(query).toLowerCase();
      const isClaimRead = text.includes('count(*)') && text.includes('llm_requests');

      if (!isClaimRead) return realExecute(query);

      /*
       * Released only once every claimant has read. The 2s race-timeout is the
       * correct-implementation path: the advisory lock serialises them, so the
       * tenth arrival never happens and each claimant proceeds on the timeout
       * having already been ordered by the lock.
       */
      const result = await realExecute(query);
      counted += 1;
      if (counted === CLAIMANTS) releaseAll();
      await Promise.race([
        allCounted,
        new Promise<void>((resolve) => setTimeout(resolve, 2_000)),
      ]);
      return result;
    };

    vi.spyOn(moduleDb, 'execute').mockImplementation(
      hook as unknown as typeof moduleDb.execute,
    );

    const claims = await Promise.all(
      Array.from({ length: CLAIMANTS }, () => claimLlmRequest('gap_analysis')),
    );

    vi.restoreAllMocks();

    expect(claims.filter((claim) => claim.ok)).toHaveLength(9);
    expect(await countRows()).toBe(LLM_REQUESTS_PER_HOUR);
  });
});
