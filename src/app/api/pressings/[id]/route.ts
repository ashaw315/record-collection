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
import { isValidFormedYear } from '@/lib/api/year';
import {
  countPressingReferences,
  deletePressing,
  discogsIdTakenByOther,
  findPressingById,
  updatePressing,
} from '@/lib/db/queries/pressings';

const optionalText = z.string().trim().max(10_000).nullish();

const patchSchema = z
  .strictObject({
    catalogNumber: optionalText,
    matrixRunout: optionalText,
    pressingPlant: optionalText,
    yearPressed: z
      .number()
      .int()
      .refine((value) => isValidFormedYear(value), { error: () => 'yearPressed is out of range' })
      .nullish(),
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
      return duplicate('Another pressing already has that Discogs id');
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
        return duplicate('Another pressing already has that Discogs id');
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
