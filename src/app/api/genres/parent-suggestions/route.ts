import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api/handler';
import { notConfigured } from '@/lib/api/errors';
import {
  genresForParentProposal,
  rejectedPairings,
} from '@/lib/db/queries/genre-hierarchy';
import {
  GENRE_PARENT_MAX_TOKENS,
  getGenreParentClient,
} from '@/lib/llm/genre-parent-client';
import { isAnthropicConfigured, isAuthFailure } from '@/lib/llm/client';
import { claimLlmRequest, completeLlmRequest, releaseLlmRequest } from '@/lib/llm/rate-limit';
import { logger } from '@/lib/logger';

/**
 * SPEC.md §12c (A44) `POST /api/genres/parent-suggestions`.
 *
 * **POST, not GET, for §9.2's reason**: a GET is prefetchable and cacheable, and
 * every call spends one of ten hourly requests against a real account. The verb
 * is part of the rate limit.
 *
 * **Suggests only. Nothing here writes a `parent_genre_id`** — the user confirms
 * each pairing through `PATCH /api/genres/:id`, which already enforces §4.1's
 * cycle rule. CLAUDE.md §8: the vocabulary is the user's, so the app proposes
 * and never assigns.
 */

export const maxDuration = 60;

export const POST = withErrorHandling('api.genres.parent-suggestions.POST', async () => {
  if (!isAnthropicConfigured()) {
    return notConfigured('Genre suggestions are not configured on this deployment.');
  }

  /*
   * Claimed BEFORE the payload is built, exactly as §9.2 does: an exhausted
   * quota costs one small query rather than a full genre scan, and claiming
   * before calling is what makes the limit a limit on requests.
   */
  const claim = await claimLlmRequest('genre_parents');
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

  const [genres, rejected] = await Promise.all([genresForParentProposal(), rejectedPairings()]);

  let result;
  try {
    result = await getGenreParentClient().propose(
      genres.map((genre) => ({
        name: genre.name,
        recordCount: genre.recordCount,
        examples: genre.examples,
      })),
    );
  } catch (error) {
    /*
     * A rejected credential never reached the model, so the slot is refunded —
     * §9.2's carve-out, and the only branch that refunds.
     */
    if (isAuthFailure(error)) {
      await releaseLlmRequest(claim.id);
      return notConfigured('The suggestion service rejected this deployment’s credential.');
    }
    throw error;
  }

  // A38's usage, inherited from the transport rather than assembled here.
  await completeLlmRequest(claim.id, {
    stopReason: result.stopReason,
    inputTokens: result.inputTokens,
    outputTokens: result.outputTokens,
  });

  if (!result.ok) {
    logger.error(
      'api.genres.parent-suggestions.unreadable',
      `reason=${result.reason} stop_reason=${result.stopReason ?? 'unknown'} ` +
        `in_tokens=${result.inputTokens ?? 'unknown'} ` +
        `out_tokens=${result.outputTokens ?? 'unknown'} max_tokens=${GENRE_PARENT_MAX_TOKENS}`,
    );

    return NextResponse.json(
      {
        error: {
          message:
            result.reason === 'cut'
              ? 'The suggestion ran out of room before proposing a whole hierarchy, so ' +
                'nothing is shown — a partial tree would hide which genres were never ' +
                'considered. This used one of your ten hourly requests.'
              : 'The suggestion service returned something we could not read. This used ' +
                'one of your ten hourly requests. Trying again may work.',
          code: 'LLM_UNREADABLE',
        },
      },
      { status: 502 },
    );
  }

  /*
   * **Rejections filtered HERE rather than in the prompt.** Telling the model
   * what was declined would spend tokens on a constraint the server can enforce
   * exactly — and an instruction is not a verification (A29c).
   */
  const byName = new Map(genres.map((genre) => [genre.name, genre.id]));
  const declined = new Set(rejected.map((r) => `${r.genreId}:${r.rejectedParentId}`));

  const pairings = result.pairings
    .map((pairing): { genreId?: string; genre: string; parentId?: string; parent: string } => ({
      genreId: byName.get(pairing.genre),
      genre: pairing.genre,
      parentId: byName.get(pairing.parent),
      parent: pairing.parent,
    }))
    .filter(
      (pairing): pairing is { genreId: string; genre: string; parentId: string; parent: string } =>
        pairing.genreId !== undefined &&
        pairing.parentId !== undefined &&
        !declined.has(`${pairing.genreId}:${pairing.parentId}`),
    );

  return NextResponse.json({
    data: {
      pairings,
      /*
       * "No existing genre fits" travels to the UI as a RESULT (A44). It is not
       * the same as a genre the model simply did not mention, and collapsing
       * them would tell the user nobody looked.
       */
      noParentFits: result.noParentFits,
      dropped: result.dropped,
      /* The evidence each pairing rests on — STATED, never rated. */
      evidence: Object.fromEntries(
        genres.map((genre) => [
          genre.name,
          { recordCount: genre.recordCount, examples: genre.examples },
        ]),
      ),
    },
  });
});
