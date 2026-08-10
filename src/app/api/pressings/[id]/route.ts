import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  badRequest,
  conflictInUse,
  duplicate,
  invalidJson,
  isUniqueViolation,
  isUuid,
  notFound,
  validationError,
} from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { verifyDiscogsRelease } from '@/lib/discogs/verify-release';
import { yearSchema } from '@/lib/api/year';
import {
  countPressingReferences,
  deletePressing,
  discogsIdTakenByOther,
  findPressingById,
  findPressingByDiscogsId,
  updatePressing,
} from '@/lib/db/queries/pressings';

const optionalText = z.string().trim().max(10_000).nullish();

const patchSchema = z
  .strictObject({
    catalogNumber: optionalText,
    matrixRunout: optionalText,
    pressingPlant: optionalText,
    yearPressed: yearSchema('Year pressed'),
    countryPressed: optionalText,
    vinylWeightGrams: z.number().int().positive().max(10_000).nullish(),
    colorVariant: optionalText,
    discogsReleaseId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullish(),
    isReissue: z.boolean().optional(),
    notes: optionalText,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.pressings.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid pressing id', 'INVALID_ID');

    const pressing = await findPressingById(id);
    if (pressing === undefined) return notFound('Pressing not found');

    return NextResponse.json(pressing);
  },
);

export const PATCH = withErrorHandling(
  'api.pressings.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid pressing id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findPressingById(id)) === undefined) return notFound('Pressing not found');

    const { discogsReleaseId } = parsed.data;
    if (
      discogsReleaseId !== null &&
      discogsReleaseId !== undefined &&
      (await discogsIdTakenByOther(id, discogsReleaseId))
    ) {
      const clash = await findPressingByDiscogsId(discogsReleaseId);
      return duplicate('Another pressing already has that Discogs id', clash?.id ?? id);
    }

    /**
     * §7.7: verified before it is stored, the same as POST.
     *
     * Closing one endpoint and not the other would leave the claim reachable by
     * a second request — create a pressing without an id, then PATCH one in.
     *
     * CLEARING it (null) needs no verification: null asserts nothing.
     */
    if (discogsReleaseId != null) {
      const verified = await verifyDiscogsRelease(discogsReleaseId);

      if (!verified.ok) {
        return verified.reason === 'not-found'
          ? badRequest(
              `No Discogs release with id ${discogsReleaseId} exists`,
              'INVALID_DISCOGS_RELEASE_ID',
            )
          : NextResponse.json(
              {
                error: {
                  message: 'Could not reach Discogs to verify that release id.',
                  code: 'UPSTREAM_ERROR',
                },
              },
              { status: 502 },
            );
      }
    }

    try {
      /**
       * Edits THIS row only — deliberately no find-or-create here. Pressings
       * are shared, so merging an edited row into a matching one would silently
       * repoint every record and want-list entry using it. Find-or-create
       * belongs on creation, where nothing yet depends on the row.
       */
      const updated = await updatePressing(id, parsed.data);
      if (updated === undefined) return notFound('Pressing not found');
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        /**
         * §5.4 requires existingId from the recovery path too. discogsReleaseId
         * is the only unique column here, so it is the only thing that can have
         * collided — re-read by it to name the winner.
         */
        const winner =
          discogsReleaseId === null || discogsReleaseId === undefined
            ? undefined
            : await findPressingByDiscogsId(discogsReleaseId);
        return duplicate('Another pressing already has that Discogs id', winner?.id ?? id);
      }
      throw error;
    }
  },
);

export const DELETE = withErrorHandling(
  'api.pressings.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid pressing id', 'INVALID_ID');

    if ((await findPressingById(id)) === undefined) return notFound('Pressing not found');

    // Three blocking referrers (§4): records, want_list.target_pressing_id, and
    // price_history — a pressing can be blocked by price history alone.
    const referenceCount = await countPressingReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Pressing is in use and cannot be deleted', referenceCount);
    }

    const outcome = await deletePressing(id);
    if (outcome.status === 'not-found') return notFound('Pressing not found');
    if (outcome.status === 'in-use') {
      return conflictInUse('Pressing is in use and cannot be deleted', outcome.referenceCount);
    }

    return NextResponse.json({ ok: true });
  },
);
