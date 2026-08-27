import { NextResponse } from 'next/server';
import { badRequest, isUuid, notConfigured, notFound } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { hydrateWantListItem } from '@/lib/db/queries/want-list';
import {
  clearAssessment,
  latestAssessment,
  storeAssessment,
} from '@/lib/db/queries/pressing-assessment';
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
  async (request: Request, context: Context) => {
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

    /*
     * **Never asked twice** (A43). A pressing assessment is a claim about an
     * album's pressing history, which does not change — unlike a gap analysis,
     * which is a claim about a collection that does. So a stored answer is
     * returned without spending a request, and each album costs one of ten
     * hourly requests exactly once.
     *
     * `?fresh=1` is the deliberate re-ask: it replaces the stored answer and
     * costs a request, which is what the user chose by asking.
     */
    const fresh = new URL(request.url).searchParams.get('fresh') === '1';
    if (!fresh) {
      const stored = await latestAssessment(id);
      if (stored !== null) {
        return NextResponse.json({ data: { ...stored, askedAt: stored.askedAt.toISOString() } });
      }
    }

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

    /*
     * Stored so it survives a reload, and so it survives ACQUISITION: §7.3 keeps
     * the want-list row (`acquireWantListItem` marks rather than deletes), which
     * is why this needs no album entity — see the schema docblock.
     */
    await storeAssessment(id, {
      verdict: result.verdict,
      pressings: result.pressings,
      dropped: result.dropped,
    });

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

/**
 * Removes a stored assessment.
 *
 * **Delete, never edit** (§7.8). Editing would transfer ownership and leave text
 * that is neither Claude's nor cleanly the user's while still labelled Claude's.
 * Removing writes nothing and leaves the row exactly as it was.
 */
export const DELETE = withErrorHandling(
  'api.want-list.pressing-assessment.DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid want-list id', 'INVALID_ID');

    await clearAssessment(id);

    return new NextResponse(null, { status: 204 });
  },
);
