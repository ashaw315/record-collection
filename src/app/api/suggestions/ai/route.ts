import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api/handler';
import { notConfigured } from '@/lib/api/errors';
import { buildCollectionSummary } from '@/lib/llm/collection-summary';
import { getGapAnalysisClient, isAnthropicConfigured, isAuthFailure } from '@/lib/llm/client';
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
    return NextResponse.json(
      {
        error: {
          message: 'The suggestion service returned something we could not read. Try again.',
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
