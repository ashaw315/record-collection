import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, isUuid, notConfigured, notFound } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import {
  deleteSnippet,
  editSnippet,
  findRecordSubject,
  readSnippet,
  storeGeneratedSnippet,
} from '@/lib/db/queries/snippet';
import { isAnthropicConfigured, isAuthFailure } from '@/lib/llm/client';
import { getSnippetClient } from '@/lib/llm/snippet-client';
import { claimLlmRequest, completeLlmRequest, releaseLlmRequest } from '@/lib/llm/rate-limit';
import { SNIPPET_MAX_TOKENS } from '@/lib/llm/snippet-client';
import { logger } from '@/lib/logger';

/**
 * Hobby's ceiling — see the gap-analysis route for the reasoning, which applies
 * unchanged. A snippet is one record rather than a whole collection so it is
 * the faster of the two calls, but it is the same model on the same plan and
 * there is no smaller limit worth choosing.
 */
export const maxDuration = 60;

/**
 * SPEC.md §5.2 (A31b): the snippet's edit and delete paths.
 *
 * **`POST` — generation — is deliberately absent and belongs to 13c unit 2.**
 * It needs the Anthropic client and the shared rate limit; these two need
 * neither, and they are the paths that touch text the user wrote. §12 splits the
 * unit so the ownership rule is judged without an LLM in the room.
 *
 * **A separate resource rather than fields on `PATCH /api/records/:id`**
 * (A31b): generation spends a rate-limited external budget and these do not, so
 * folding them in would put a metered side effect behind a general-purpose
 * update. §5.9 makes the same split for images.
 */

const generateSchema = z.object({ confirmReplace: z.boolean().optional() }).strict();

/**
 * SPEC.md §5.2 (A31b) `POST /api/records/:id/snippet` — §10b's generation.
 *
 * **The ownership check comes BEFORE the claim and before the call**, and the
 * order is the decision this unit had to make:
 *
 *   valid id -> record exists -> may we replace? -> claim -> generate -> store
 *
 * §9.2's route claims first because its failures are only knowable after the
 * call. This one is different: the refusal is knowable from a column, so
 * generating first would bill the account and burn one of ten hourly slots to
 * produce text that is then thrown away. Checking first costs one indexed read.
 *
 * **The rule itself is unit 1's and is not restated here.**
 * `storeGeneratedSnippet` refuses on its own, atomically, in the same statement
 * as the write. This pre-check is an OPTIMISATION that avoids spending money,
 * not the guard — and the final write still enforces it, so an edit landing
 * between the two is still refused rather than overwritten.
 */
export const POST = withErrorHandling(
  'POST /api/records/:id/snippet',
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return badRequest('That is not a valid record id.', 'INVALID_ID');
    }

    /*
     * An absent body is legal — the common case is a plain regenerate with no
     * options — so only a PRESENT body is parsed, and a malformed one is a 400
     * rather than silently ignored.
     */
    let options: z.infer<typeof generateSchema> = {};
    const raw = await request.text();
    if (raw.trim() !== '') {
      let parsedJson: unknown;
      try {
        parsedJson = JSON.parse(raw);
      } catch {
        return badRequest('The request body must be JSON.', 'INVALID_BODY');
      }
      const parsed = generateSchema.safeParse(parsedJson);
      if (!parsed.success) {
        return badRequest('Unexpected fields in the request body.', 'VALIDATION_FAILED');
      }
      options = parsed.data;
    }

    if (!isAnthropicConfigured()) {
      return notConfigured(
        'Snippets are not configured on this deployment. Add an Anthropic API key to enable them.',
      );
    }

    const subject = await findRecordSubject(id);
    if (subject === null) {
      return notFound('That record does not exist.');
    }

    /*
     * §7.8 (A31a). Checked here so a refusal costs nothing; enforced again by
     * the write below, which is the actual guard.
     */
    if (options.confirmReplace !== true) {
      const current = await readSnippet(id);
      if (current !== null && current.snippetEditedAt !== null) {
        return NextResponse.json(
          {
            error: {
              message:
                'You have edited this snippet, so it will not be replaced automatically. Confirm to replace it.',
              code: 'SNIPPET_EDITED',
            },
          },
          { status: 409 },
        );
      }
    }

    const claim = await claimLlmRequest('snippet');
    if (!claim.ok) {
      return NextResponse.json(
        {
          error: {
            message: 'AI features are limited to 10 requests an hour.',
            code: 'RATE_LIMITED',
            retryAt: claim.retryAt.toISOString(),
          },
        },
        { status: 429 },
      );
    }

    let generated;
    try {
      generated = await getSnippetClient().write(subject);
    } catch (error) {
      if (!isAuthFailure(error)) throw error;

      // Never served, never billed — so the slot goes back (R5's F1).
      await releaseLlmRequest(claim.id);

      return NextResponse.json(
        {
          error: {
            message:
              'The snippet service rejected this deployment’s credential. Snippets are unavailable until it is corrected.',
            code: 'LLM_UNAUTHORIZED',
          },
        },
        { status: 502 },
      );
    }

    /*
     * **Served, so the slot is spent for the hour — marked, not merely left.**
     *
     * Both outcomes below reached the model and cost the account, so this sits
     * above the readability check rather than on the success path. The
     * auth-failure branch above is the only one that never reached it, and it
     * removes its row instead.
     *
     * An uncompleted row is read as a timeout by `ABANDONED_CLAIM_MS` and stops
     * counting after 90 seconds, which would refund a billed call.
     */
    /*
     * A38's usage recording, now inherited from the shared transport rather
     * than reimplemented — the same call the gap-analysis route makes.
     */
    await completeLlmRequest(claim.id, {
      stopReason: generated.stopReason,
      inputTokens: generated.inputTokens,
      outputTokens: generated.outputTokens,
    });

    if (!generated.ok) {
      /*
       * Nothing is stored. An empty snippet on the record would be
       * indistinguishable from one the user deleted, which §4.2 treats as a
       * deliberate act.
       */
      /*
       * **The diagnostic this route did not have.** `withErrorHandling` logs
       * THROWN errors and this is a RETURNED response, so nothing here ever
       * reached `logger.error` — the identical gap A38 closed on the sibling
       * route, and the reason Adam's failure could not be diagnosed.
       *
       * SHAPE ONLY: counts and a stop reason, never the response text.
       */
      logger.error(
        'api.records.snippet.unreadable',
        `reason=${generated.reason} stop_reason=${generated.stopReason ?? 'unknown'} ` +
          `in_tokens=${generated.inputTokens ?? 'unknown'} ` +
          `out_tokens=${generated.outputTokens ?? 'unknown'} max_tokens=${SNIPPET_MAX_TOKENS}`,
      );

      /*
       * **Says WHICH failure, because they imply different actions** — the same
       * distinction §9.2 draws. A note cut at the ceiling will be cut again;
       * an unreadable one may not be.
       */
      return NextResponse.json(
        {
          error: {
            message:
              generated.reason === 'cut'
                ? 'The note ran out of room before it was finished, so nothing was saved. ' +
                  'This used one of your ten hourly requests, and trying again may stop at ' +
                  'the same place.'
                : 'The snippet service returned something we could not read, so nothing was ' +
                  'saved. This used one of your ten hourly requests. Trying again may work.',
            code: 'LLM_UNREADABLE',
          },
        },
        { status: 502 },
      );
    }

    const stored = await storeGeneratedSnippet(id, generated.snippet, {
      confirmReplace: options.confirmReplace,
    });

    if (!stored.ok) {
      /*
       * The window between the pre-check and here: an edit landed while the
       * model was working. Unit 1's write refuses rather than overwriting, which
       * is why the pre-check can be an optimisation rather than the guard.
       */
      return stored.reason === 'not_found'
        ? notFound('That record does not exist.')
        : NextResponse.json(
            {
              error: {
                message: 'You edited this snippet while it was being written, so it was kept.',
                code: 'SNIPPET_EDITED',
              },
            },
            { status: 409 },
          );
    }

    return NextResponse.json({ data: { snippet: generated.snippet } });
  },
);

/**
 * `.strict()` per CLAUDE.md §6: unknown keys are rejected rather than ignored.
 *
 * That is load-bearing here rather than routine. `snippet_edited_at` is what
 * decides whether a regeneration may overwrite the user's text, and it is the
 * SERVER's to set — a client that could pass it in the body could hand its own
 * text back to the app to replace unasked.
 */
const editSchema = z
  .object({
    snippet: z.string().trim().min(1),
  })
  .strict();

export const PATCH = withErrorHandling(
  'PATCH /api/records/:id/snippet',
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return badRequest('That is not a valid record id.', 'INVALID_ID');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return badRequest('The request body must be JSON.', 'INVALID_BODY');
    }

    const parsed = editSchema.safeParse(body);
    if (!parsed.success) {
      return badRequest('A snippet is required.', 'VALIDATION_FAILED');
    }

    const result = await editSnippet(id, parsed.data.snippet);

    if (!result.ok) {
      return notFound('That record does not exist.');
    }

    return NextResponse.json({ data: { snippet: parsed.data.snippet } });
  },
);

/**
 * §4.2: clears `snippet` and LEAVES `snippet_edited_at` — a deliberate deletion
 * is an edit, and the user owns the absence as much as they would own
 * replacement text.
 *
 * Idempotent: deleting a snippet that is already absent is a 200, because the
 * caller's intent ("this record should have no snippet") is satisfied either
 * way. A 404 there would report a failure for a state the user asked for.
 */
export const DELETE = withErrorHandling(
  'DELETE /api/records/:id/snippet',
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return badRequest('That is not a valid record id.', 'INVALID_ID');
    }

    const result = await deleteSnippet(id);

    if (!result.ok) {
      return notFound('That record does not exist.');
    }

    return NextResponse.json({ data: { snippet: null } });
  },
);
