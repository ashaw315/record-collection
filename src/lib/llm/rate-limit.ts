import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';

/**
 * SPEC.md §9.2's rate limit, enforced server-side against §4.3's
 * `llm_requests`.
 *
 * **Not the §6 token bucket, and the reason is worth keeping** — "we already
 * have a limiter" is the obvious wrong answer. That bucket makes callers WAIT
 * (`waitMs()` reports how long until a token frees, and the Discogs client
 * awaits it), which is right for a 60/minute transport limit where the request
 * should eventually go. A quota must REFUSE: the eleventh request in an hour is
 * told "not now", not held for six minutes. And the bucket is in-memory per
 * module instance, so on a serverless host the ceiling would be per-instance
 * and reset on every cold start — R5's "enforced server-side or trusted from
 * the client?" answered badly.
 */

/** §9.2. Shared by both callers, since they spend the same account (§4.3). */
export const LLM_REQUESTS_PER_HOUR = 10;

const WINDOW_MS = 60 * 60 * 1000;

/**
 * The advisory-lock key claimants serialise on. An arbitrary constant, but a
 * FIXED one: two different keys would let two claimants proceed in parallel,
 * which is the defect the lock exists to close.
 */
const CLAIM_LOCK_KEY = 8_141_972;

export type LlmRequestKind = 'gap_analysis' | 'snippet';

export type ClaimResult =
  | { ok: true }
  /** `retryAt` is when the oldest request in the window ages out. */
  | { ok: false; retryAt: Date };

/**
 * Claims one request against the hour's budget, or refuses.
 *
 * **The count and the insert are ONE statement, and that is the entire point of
 * this module.** A `SELECT count(*)` followed by an `INSERT` is check-then-act:
 * two concurrent requests both read 9, both conclude there is room, and both
 * write — an eleventh request admitted by a limiter that was correct at every
 * individual step. §7.3's acquire flow is the same defect one table over, and
 * §4.3 states the rule: a pre-check handles bad input, and only the atomic
 * write handles what changes between the check and the write.
 *
 * `INSERT ... SELECT ... WHERE (SELECT count(*) ...) < limit` evaluates the
 * count and performs the insert under one snapshot, so **zero rows inserted IS
 * the refusal** — the caller learns the outcome from what the database did
 * rather than from what it predicted.
 */
export async function claimLlmRequest(kind: LlmRequestKind): Promise<ClaimResult> {
  const db = getDb();
  const windowStart = new Date(Date.now() - WINDOW_MS);

  /*
   * **`pg_advisory_xact_lock` first, and it is load-bearing — the conditional
   * insert alone is NOT enough.**
   *
   * Measured, not reasoned about: without the lock, ten concurrent claims
   * against nine free slots admitted TEN, reproducibly, about two runs in five.
   * `INSERT ... SELECT ... WHERE (count) < limit` is one statement, which makes
   * it atomic with respect to its own snapshot — but under READ COMMITTED that
   * snapshot cannot see other transactions' uncommitted rows, so every
   * concurrent statement counts the same nine and every one of them inserts.
   *
   * A single statement is not the same as a serialised one. The count and the
   * insert cannot interleave with each other, which is what defeats the
   * check-then-act shape; they can still interleave with ANOTHER caller's pair,
   * which is what admits the eleventh request.
   *
   * The advisory lock serialises claimants against each other on one key, held
   * to the end of the enclosing transaction. It is taken before the count, so
   * the next claimant reads a committed table rather than a stale snapshot.
   */
  const inserted = await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(${CLAIM_LOCK_KEY})`);

    return tx.execute<{ id: string }>(sql`
      INSERT INTO llm_requests (kind)
      SELECT ${kind}
      WHERE (
        SELECT COUNT(*) FROM llm_requests WHERE requested_at > ${windowStart}
      ) < ${LLM_REQUESTS_PER_HOUR}
      RETURNING id
    `);
  });

  if (inserted.rows.length > 0) return { ok: true };

  /*
   * Refused, so say WHEN rather than "later". §9.2 requires a legible refusal:
   * an exhausted quota is a fact the app knows, and reporting it as a bare
   * error sends the reader to application logs for something the app could have
   * said. The oldest row in the window ages out one hour after it was made.
   *
   * Read AFTER the failed insert rather than before: a value read first would
   * describe a window that has since moved, and this path is not hot.
   */
  /*
   * Typed as a STRING, not a Date. `db.execute` runs raw SQL and returns what
   * the driver gives — a timestamp string — so annotating it `Date` was a claim
   * about the value rather than a conversion of it, and `.getTime()` threw.
   * The compiler believed the annotation; the test did not.
   */
  const oldest = await db.execute<{ requested_at: string | Date }>(sql`
    SELECT requested_at FROM llm_requests
     WHERE requested_at > ${windowStart}
     ORDER BY requested_at ASC
     LIMIT 1
  `);

  const raw = oldest.rows[0]?.requested_at;
  const oldestAt = raw === undefined ? undefined : new Date(raw);

  /*
   * No oldest row means the window emptied between the insert and this read —
   * capacity is available now. Reporting a future time would be a worse lie
   * than reporting the present, and the caller's retry will succeed.
   */
  return {
    ok: false,
    retryAt: oldestAt === undefined ? new Date() : new Date(oldestAt.getTime() + WINDOW_MS),
  };
}
