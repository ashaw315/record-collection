import { NextResponse } from 'next/server';
import { badRequest, isUuid, notConfigured, notFound } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import { isAnthropicConfigured, isAuthFailure } from '@/lib/llm/client';
import {
  PRESSING_ASSESSMENT_MAX_TOKENS,
  getPressingAssessmentClient,
} from '@/lib/llm/pressing-assessment-client';
import { claimLlmRequest, completeLlmRequest, releaseLlmRequest } from '@/lib/llm/rate-limit';
import { logger } from '@/lib/logger';

/**
 * SPEC.md §12b (A43) `POST /api/want-list/:id/pressing-assessment`.
 *
 * **POST and per-row, never automatic** — §9.2's rule and §10a's: every call
 * spends one of ten hourly requests, so it happens when the user asks and never
 * on page load.
 *
 * **Nothing is stored.** The assessment is displayed at the moment of asking;
 * `best_dig_notes` in particular stays the user's own field, and text a model
 * produced sitting there would be indistinguishable from text they wrote
 * (§7.8's ownership lesson, applied before the fact rather than after).
 */

export const maxDuration = 60;

type Context = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(
  'api.want-list.pressing-assessment.POST',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid want-list id', 'INVALID_ID');

    if (!isAnthropicConfigured()) {
      return notConfigured('Pressing assessment is not configured on this deployment.');
    }

    /*
     * The row is read BEFORE a slot is claimed: a 404 should not cost the user
     * one of ten requests.
     */
    const item = await hydrateWantListItem(id);
    if (item === undefined) return notFound('Want-list item not found');

    const claim = await claimLlmRequest('pressing_assessment');
    if (!claim.ok) {
      return NextResponse.json(
        {
          error: {
            message: 'You have used all ten suggestion requests this hour.',
            code: 'RATE_LIMITED',
            retryAt: claim.retryAt.toISOString(),
          },
        },
        { status: 429 },
      );
    }

    let result;
    try {
      /*
       * **Artist and title only** (A43). Not the user's own dig notes: sending
       * them invites the model to agree, and an assessment confirming what the
       * user already believes is worth less than one arrived at independently —
       * disagreement is the informative case.
       */
      result = await getPressingAssessmentClient().assess({
        artist: item.artist?.name ?? '',
        title: item.title,
      });
    } catch (error) {
      if (isAuthFailure(error)) {
        await releaseLlmRequest(claim.id);
        return notConfigured('The suggestion service rejected this deployment’s credential.');
      }
      throw error;
    }

    await completeLlmRequest(claim.id, {
      stopReason: result.stopReason,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    });

    if (!result.ok) {
      logger.error(
        'api.want-list.pressing-assessment.unreadable',
        `reason=${result.reason} stop_reason=${result.stopReason ?? 'unknown'} ` +
          `in_tokens=${result.inputTokens ?? 'unknown'} ` +
          `out_tokens=${result.outputTokens ?? 'unknown'} ` +
          `max_tokens=${PRESSING_ASSESSMENT_MAX_TOKENS}`,
      );

      return NextResponse.json(
        {
          error: {
            message:
              result.reason === 'cut'
                ? 'The assessment ran out of room before finishing. This used one of your ten ' +
                  'hourly requests, and trying again may stop at the same place.'
                : 'The assessment service returned something we could not read. This used one ' +
                  'of your ten hourly requests. Trying again may work.',
            code: 'LLM_UNREADABLE',
          },
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      data: {
        verdict: result.verdict,
        pressings: result.pressings,
        /*
         * `dropped` travels to the UI for A29d's reason: a pressing discarded
         * for naming nothing checkable makes the answer shorter, and a shorter
         * answer with no explanation makes the rule invisible.
         */
        dropped: result.dropped,
        askedAt: new Date().toISOString(),
      },
    });
  },
);
