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
 * How long a claim with no completion keeps counting against the budget.
 *
 * **This is the only way a serverless timeout can give its slot back.** R6
 * finding 5 named the leak at the release site, but it cannot be fixed there:
 * a function killed at `maxDuration` runs no `finally`, no cleanup callback and
 * no signal handler — the isolate stops executing. Code shaped like "release
 * the slot on timeout" would have to run inside the function being killed.
 *
 * So an uncompleted claim expires instead. A row claimed and never completed is
 * exactly the timeout signature.
 *
 * **90 seconds is derived from the platform, not chosen.** `vercel.json` sets
 * `maxDuration` to Hobby's 60s ceiling, so nothing can still be running at 90s
 * — the platform has already killed it. That margin is what makes this unable
 * to evict a LIVE call, which is the only way the rule could do harm: evicting
 * a claim whose request is still in flight would admit an eleventh concurrent
 * call against a budget of ten. **If the ceiling ever rises, this must rise
 * with it**, and a test asserts the margin rather than the number.
 */
export const ABANDONED_CLAIM_MS = 90 * 1000;

/**
 * The advisory-lock key claimants serialise on. An arbitrary constant, but a
 * FIXED one: two different keys would let two claimants proceed in parallel,
 * which is the defect the lock exists to close.
 */
const CLAIM_LOCK_KEY = 8_141_972;

/**
 * §4.3's `kind`, and every caller that spends the shared budget.
 *
 * **`genre_parents` added by A44** — the third caller. `kind` records WHICH
 * asked, for diagnosis, and takes no part in the count: all three spend the same
 * ten requests an hour against the same account, because two independent limits
 * would be a twenty-per-hour limit nobody specified.
 */
export type LlmRequestKind = 'gap_analysis' | 'snippet' | 'genre_parents';

export type ClaimResult =
  /**
   * `id` is the row this claim wrote, and it exists so a refund can target its
   * OWN row (`releaseLlmRequest`). Deleting "the most recent" row instead would
   * delete a concurrent caller's claim.
   */
  | { ok: true; id: string }
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
  /**
   * Rows claimed before this and never completed are abandoned — see
   * `ABANDONED_CLAIM_MS`. A COMPLETED row counts for the full hour regardless
   * of age, because that call was served and billed; §9.2 is deliberate that
   * even an unreadable response keeps its slot.
   */
  const abandonedBefore = new Date(Date.now() - ABANDONED_CLAIM_MS);

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
        SELECT COUNT(*) FROM llm_requests
         WHERE requested_at > ${windowStart}
           AND (completed_at IS NOT NULL OR requested_at > ${abandonedBefore})
      ) < ${LLM_REQUESTS_PER_HOUR}
      RETURNING id
    `);
  });

  const claimedId = inserted.rows[0]?.id;
  if (claimedId !== undefined) return { ok: true, id: claimedId };

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
       AND (completed_at IS NOT NULL OR requested_at > ${abandonedBefore})
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

/**
 * Returns a claimed slot to the hour's budget.
 *
 * **Only for a call the account was never charged for**, which in practice
 * means an upstream auth rejection (`isAuthFailure`). §9.2 is deliberate that an
 * unreadable response KEEPS its slot: that call completed and was billed, and
 * refunding it would let a persistently failing model be retried without limit.
 * The narrow case is different in kind — a 401 means the request was never
 * served, so charging the user's quota for it makes a deployment fault look like
 * their own overuse.
 *
 * **By id, never by recency.** Deleting the most recent row would delete a
 * CONCURRENT caller's claim: two requests in flight, the first fails on auth and
 * refunds while the second is still working, and the second silently loses the
 * slot it holds. The id is why `ClaimResult` carries one.
 *
 * Silent when the row is already gone. This runs on an error path, and a throw
 * here would replace a legible 502 with the 500 this whole change exists to
 * remove.
 */
export async function releaseLlmRequest(id: string): Promise<void> {
  const db = getDb();

  await db.execute(sql`DELETE FROM llm_requests WHERE id = ${id}`);
}

/**
 * Marks a claim as served, so it counts for the full hour.
 *
 * **The counterpart to `ABANDONED_CLAIM_MS`, and the reason the expiry is safe
 * to have at all.** Without this every claim would look abandoned after 90
 * seconds and the budget would refund itself, which is worse than the leak it
 * replaces: the quota exists to cap a paid account, and a quota that forgets is
 * not a quota. The expiry only ever releases rows that NOTHING completed.
 *
 * Called on every path that reached the model and got an answer — including an
 * unreadable one, per §9.2: that call was served and billed, so it keeps its
 * slot. The auth-failure path calls `releaseLlmRequest` instead, which removes
 * the row entirely, because that request was never served.
 *
 * **By id, never by recency**, for the same reason the release is: marking "the
 * newest" would complete a concurrent caller's claim and leave this one looking
 * abandoned.
 *
 * Silent when the row is gone. This runs after a successful call, and throwing
 * would turn the answer the user actually wanted into a 500 at the last step,
 * for a bookkeeping write.
 */
/**
 * What the call cost, as the transport reported it (A38).
 *
 * Optional throughout: a caller with nothing to report writes NULL, which means
 * "not measured" and never zero.
 */
export type LlmUsage = {
  stopReason?: string | null;
  inputTokens?: number | null;
  outputTokens?: number | null;
};

export async function completeLlmRequest(id: string, usage?: LlmUsage): Promise<void> {
  const db = getDb();

  /*
   * **The same UPDATE that was already running on both paths**, which is why
   * this is the right place: `completeLlmRequest` is called before the
   * success/failure branch, so recording here cannot repeat the defect it
   * fixes — a diagnostic that fires on one branch only.
   *
   * These columns are DIAGNOSTIC. Nothing in `claimLlmRequest` reads them; see
   * the rule at the column in `schema.ts` for why the quota counts requests
   * rather than tokens.
   */
  await db.execute(sql`
    UPDATE llm_requests
       SET completed_at = now(),
           input_tokens = ${usage?.inputTokens ?? null},
           output_tokens = ${usage?.outputTokens ?? null},
           stop_reason = ${usage?.stopReason ?? null}
     WHERE id = ${id}`);
}
