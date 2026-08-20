import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api/handler';
import { notConfigured } from '@/lib/api/errors';
import { buildCollectionSummary } from '@/lib/llm/collection-summary';
import { getGapAnalysisClient, isAnthropicConfigured } from '@/lib/llm/client';
import { claimLlmRequest } from '@/lib/llm/rate-limit';

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
   * absence must be named HERE — `notConfigured` says which credential is
   * missing instead of "Internal server error", which would send the reader to
   * application logs for a deployment problem.
   */
  if (!isAnthropicConfigured()) {
    return notConfigured('AI suggestions are not configured. Set ANTHROPIC_API_KEY.');
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
  const result = await getGapAnalysisClient().analyse(summary);

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
