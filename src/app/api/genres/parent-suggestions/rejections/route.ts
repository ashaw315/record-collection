import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { rejectParentPairing } from '@/lib/db/queries/genre-hierarchy';
import { findGenreById } from '@/lib/db/queries/genres';

/**
 * SPEC.md §12c (A44) `POST /api/genres/parent-suggestions/rejections`.
 *
 * **A rejection is a first-class outcome, not an absence.** Without recording
 * it, a user who declines "UK82 under Rock" is offered it again on the next run
 * — and a feature that must be dismissed repeatedly is one nobody uses twice.
 *
 * **This writes no hierarchy.** Declining a pairing leaves the genre exactly
 * where it was; the only thing stored is that this pairing should not be
 * proposed again.
 */

const bodySchema = z
  .object({
    genreId: z.string().uuid(),
    rejectedParentId: z.string().uuid(),
  })
  .strict();

export const POST = withErrorHandling(
  'api.genres.parent-suggestions.rejections.POST',
  async (request: Request) => {
    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return badRequest('Invalid JSON body', 'INVALID_JSON');
    }

    const parsed = bodySchema.safeParse(raw);
    if (!parsed.success) return validationError(parsed.error);

    const { genreId, rejectedParentId } = parsed.data;

    /*
     * Both genres verified to exist before anything is written. The FKs would
     * reject a bad id anyway, but as a 500 shaped from a constraint violation
     * rather than a 400 naming the field — §5's shape, and the same reasoning
     * `PATCH /api/want-list/:id` uses for its relations.
     */
    const fieldErrors: Record<string, string> = {};
    if ((await findGenreById(genreId)) === undefined) {
      fieldErrors.genreId = 'No genre with that id exists';
    }
    if ((await findGenreById(rejectedParentId)) === undefined) {
      fieldErrors.rejectedParentId = 'No genre with that id exists';
    }
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: { message: 'Unknown genre', code: 'VALIDATION_FAILED', fieldErrors } },
        { status: 400 },
      );
    }

    // Idempotent: clicking reject twice is the same fact, not an error.
    await rejectParentPairing({ genreId, rejectedParentId });

    return new NextResponse(null, { status: 204 });
  },
);
