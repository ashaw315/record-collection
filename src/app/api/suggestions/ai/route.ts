import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api/handler';
import { notConfigured } from '@/lib/api/errors';
import { buildCollectionSummary } from '@/lib/llm/collection-summary';
import {
  GAP_ANALYSIS_MAX_TOKENS,
  getGapAnalysisClient,
  isAnthropicConfigured,
  isAuthFailure,
} from '@/lib/llm/client';
import { logger } from '@/lib/logger';
import { claimLlmRequest, completeLlmRequest, releaseLlmRequest } from '@/lib/llm/rate-limit';

/**
 * **Hobby's ceiling, and the app can genuinely reach it.**
 *
 * R5 measured one gap analysis at 44 seconds. `maxDuration` covers the WHOLE
 * function — auth, the claim transaction, `buildCollectionSummary`, the model
 * call and the JSON parse — not just the Anthropic request, so 16 seconds of
 * nominal headroom is less than it sounds. A slower response is killed and the
 * user gets nothing back.
 *
 * 60 is not a tuned number: it is the maximum a Hobby plan allows, so there is
 * no larger value to choose. The mitigation for the kill is elsewhere —
 * `ABANDONED_CLAIM_MS` returns the quota slot the kill would otherwise burn,
 * because no code in this function runs after the platform stops the isolate.
 *
 * Declared here rather than only in `vercel.json` because Next validates a
 * route segment export at build time, while a `functions` glob that no longer
 * matches a moved file fails SILENTLY back to the 10s default.
 */
export const maxDuration = 60;

/**
 * SPEC.md §5.8 `POST /api/suggestions/ai` — §9.2's LLM gap analysis.
 *
 * **POST, not GET, and that is not only convention.** §9.2 requires this to be
 * user-initiated and never called on page load; a GET is prefetchable,
 * cacheable and reachable from a link, all of which would spend budget nobody
 * asked to spend. The verb is part of the rate limit.
 *
 * The order of operations is deliberate and each step guards the next:
 *
 *   configured? -> claim a slot -> build the payload -> call -> parse
 *
 * Claiming BEFORE building means an exhausted quota costs one small query
 * rather than a full collection scan, and claiming before calling is what makes
 * the limit a limit on requests rather than on responses.
 */
export const POST = withErrorHandling('api.suggestions.ai.POST', async () => {
  /*
   * §9.2's key is optional at boot so a missing one degrades this feature
   * rather than stopping the server (env/schema.ts). The cost is that the
   * absence must be named HERE — `notConfigured` says the feature is
   * unconfigured instead of "Internal server error", which would send the
   * reader to application logs for a deployment problem.
   *
   * **`isAnthropicConfigured` also rejects placeholders**, not only absence: a
   * `-put-your-key-here` value passed the old non-empty check, claimed a slot
   * and reached the API before failing (R5's live run).
   */
  if (!isAnthropicConfigured()) {
    /*
     * **Names no environment variable**, per `errors.ts`'s rule for
     * `notConfigured`: the message reaches a browser, and naming the variable
     * describes the deployment's shape to whoever is looking. This previously
     * read "Set ANTHROPIC_API_KEY." — the images route got this right ("Add a
     * Vercel Blob store") and this one did not.
     */
    return notConfigured(
      'AI suggestions are not configured on this deployment. Add an Anthropic API key to enable them.',
    );
  }

  const claim = await claimLlmRequest('gap_analysis');

  if (!claim.ok) {
    /*
     * 429 rather than 500: a spent quota is not an internal fault, and §9.2
     * (A29b) requires a legible refusal naming when capacity returns. "Try
     * later" with no time is the same non-answer as a bare error — the app
     * knows when the oldest request ages out, so it says.
     */
    return NextResponse.json(
      {
        error: {
          message: 'AI suggestions are limited to 10 requests an hour.',
          code: 'RATE_LIMITED',
          retryAt: claim.retryAt.toISOString(),
        },
      },
      { status: 429 },
    );
  }

  const summary = await buildCollectionSummary();

  let result;
  try {
    result = await getGapAnalysisClient().analyse(summary);
  } catch (error) {
    /*
     * **The case R5's live run actually hit**, and the reason §9.2 did not work.
     * A placeholder key reached the API, was rejected, and the throw reached
     * `withErrorHandling` — so the user saw "Internal server error" for a
     * credential problem the app had been told about in words.
     *
     * Anything that is NOT an auth failure keeps the old behaviour deliberately:
     * a 529 overload or a network fault is an unanticipated error, and
     * `withErrorHandling` logging it with a stack is the right treatment. Only
     * the case we can describe precisely gets its own answer.
     */
    if (!isAuthFailure(error)) throw error;

    /*
     * The slot goes back. Unlike an unreadable response, this call was never
     * served and never billed — charging the hour's budget for it would make a
     * deployment fault look like the user's own overuse, and ten clicks against
     * a bad key would exhaust a quota protecting nothing.
     */
    await releaseLlmRequest(claim.id);

    /*
     * 502 like `LLM_UNREADABLE` — the failure is upstream rather than ours — but
     * a distinct code, because the two need different sentences. And NO retry
     * advice: a rejected credential is not transient, so "try again" is wrong
     * advice that sends the user round the same loop. The variable is not named,
     * per `errors.ts`'s rule for messages that reach a browser.
     */
    return NextResponse.json(
      {
        error: {
          message:
            'The suggestion service rejected this deployment’s credential. AI suggestions are unavailable until it is corrected.',
          code: 'LLM_UNAUTHORIZED',
        },
      },
      { status: 502 },
    );
  }

  /*
   * **The call was served, so the slot is spent for the hour — say so.**
   *
   * Placed here rather than on the happy path because both outcomes below have
   * reached the model and cost the account: §9.2 is explicit that an unreadable
   * response keeps its slot. The auth-failure branch above is the only one that
   * did NOT reach it, and it removes its row instead.
   *
   * Without this the row stays `completed_at IS NULL` and
   * `ABANDONED_CLAIM_MS` reads it as a timeout, refunding a billed call after
   * 90 seconds. A quota that forgets is not a quota.
   */
  await completeLlmRequest(claim.id);

  if (!result.ok) {
    /*
     * **Unreadable is not empty**, and the status says so: 502, because the
     * failure is upstream rather than ours, and a distinct code so the UI can
     * tell the user "we could not read the answer" rather than "there are no
     * gaps". Collapsing those is the absent-versus-unknown failure, and here it
     * would tell someone their collection is complete when the truth is that a
     * response was truncated.
     *
     * The slot stays spent. The request DID cost the account, and refunding it
     * would let a persistently failing model be retried without limit — the
     * opposite of what the quota protects.
     */

    /*
     * **The log this route did not have**, and its absence is what made Adam's
     * live 502 undiagnosable: `withErrorHandling` logs THROWN errors, and this
     * is a RETURNED response, so nothing here ever reached `logger.error`.
     *
     * SHAPE ONLY. The prompt carries the user's artists, labels and want-list
     * titles, so the reply can echo them, and Vercel logs are readable by
     * anyone with dashboard access — the same argument that made
     * `describeError` a redacted projection after R6 reproduced a credential in
     * a log line. A deliberate log does not get a weaker standard than an
     * accidental one, so this quotes nothing.
     */
    logger.error(
      'api.suggestions.ai.unreadable',
      `reason=${result.reason} stop_reason=${result.stopReason ?? 'unknown'} ` +
        `chars=${result.length} in_tokens=${result.inputTokens ?? 'unknown'} ` +
        `out_tokens=${result.outputTokens ?? 'unknown'} max_tokens=${GAP_ANALYSIS_MAX_TOKENS}`,
    );

    /*
     * **The message says which failure it was, because they imply different
     * actions.** "Try again" was advice the app had no reason to believe: on a
     * truncated answer a retry stops in the same place and spends another of
     * ten hourly requests. That is the same shape as the 401 that said "try
     * again" until R6 fixed it.
     *
     * **The cost is named**, because the app knows it and the user could not
     * see it: a slot was spent whatever the outcome (§9.2's refund covers 401
     * and 403 only).
     *
     * **And no cause is asserted beyond what the signal carries.**
     * `stop_reason: max_tokens` proves the answer ran out of room; it does NOT
     * prove the collection is why — the model could equally have written a few
     * verbose suggestions. Naming the collection here would be the app
     * publishing a hypothesis as a diagnosis. When the scaling work lands and
     * there is a narrower request to offer, this copy can point at it.
     */
    const ranOutOfRoom = result.reason === 'cut' || result.stopReason === 'max_tokens';

    return NextResponse.json(
      {
        error: {
          message: ranOutOfRoom
            ? /*
               * **Still accurate, and no longer the expected failure** (A37).
               * The prompt now asks for at most six suggestions, so a request
               * that still runs out of room did so writing unusually long
               * reasons rather than too many suggestions — measured headroom is
               * roughly 2.5x at six. A retry is therefore worth something here
               * in a way it was not before the count, so the advice softens
               * from "will likely" to "may".
               */
              'The suggestion service ran out of room before finishing its answer. ' +
              'This used one of your ten hourly requests, and trying again may stop ' +
              'at the same place.'
            : 'The suggestion service returned something we could not read. ' +
              'This used one of your ten hourly requests. Trying again may work.',
          code: 'LLM_UNREADABLE',
        },
      },
      { status: 502 },
    );
  }

  /*
   * `dropped` travels to the UI. A29d: a suggestion whose genre is outside the
   * user's hierarchy is discarded, and a shorter list with no explanation makes
   * the model's error invisible.
   */
  return NextResponse.json({
    data: { suggestions: result.suggestions, dropped: result.dropped },
  });
});
