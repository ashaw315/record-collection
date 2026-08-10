import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, invalidJson, isUniqueViolation, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { verifyDiscogsRelease } from '@/lib/discogs/verify-release';
import { parseListParams } from '@/lib/api/query-params';
import { yearSchema } from '@/lib/api/year';
import {
  PRESSING_SORT_FIELDS,
  createPressing,
  findMatchingPressing,
  findPressingByDiscogsId,
  listPressings,
} from '@/lib/db/queries/pressings';

/**
 * SPEC.md §5.4 CRUD for `pressings`, with §4's find-or-create semantics.
 *
 * POST returns 201 when it created a row and 200 when it reused one, so a
 * caller can tell the difference — the record form needs to know whether it
 * just attached to a pressing another record already uses.
 */

const optionalText = z.string().trim().max(10_000).nullish();

/**
 * Reuses the artist year bound: a pressing cannot predate recorded sound
 * either, and the upper edge moves with the clock for the same reason.
 */
const pressedYear = yearSchema('Year pressed');

const pressingFields = {
  catalogNumber: optionalText,
  matrixRunout: optionalText,
  pressingPlant: optionalText,
  yearPressed: pressedYear,
  countryPressed: optionalText,
  vinylWeightGrams: z.number().int().positive().max(10_000).nullish(),
  colorVariant: optionalText,
  discogsReleaseId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullish(),
  isReissue: z.boolean().optional(),
  notes: optionalText,
};

const createSchema = z.strictObject(pressingFields);

export const GET = withErrorHandling('api.pressings.GET', async (request: Request) => {
  const params = parseListParams(new URL(request.url).searchParams, PRESSING_SORT_FIELDS);
  if (!params.ok) {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          fieldErrors: params.fieldErrors,
        },
      },
      { status: 400 },
    );
  }

  const { page, pageSize, offset, sort } = params.value;
  const { rows, total } = await listPressings({ limit: pageSize, offset, sort });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize } });
});

export const POST = withErrorHandling('api.pressings.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const input = parsed.data;

  /**
   * §4 find-or-create. findMatchingPressing returns undefined when the match
   * key is empty, so an all-null request always falls through to create — two
   * unrelated white labels must not collapse into one shared row.
   */
    /**
     * §7.7: a client-supplied `discogsReleaseId` is VERIFIED before it is
     * stored. The server holds the release detail and the cache, so a client
     * asserting a fact the server can establish is a pattern to eliminate.
     *
     * An unverified id in this column is inherited by every future reader of
     * the row — §7.7's tier 1 was the first, and it answered "you own this
     * pressing" for an unrelated record until the corroboration landed.
     */
    if (input.discogsReleaseId != null) {
      const verified = await verifyDiscogsRelease(input.discogsReleaseId);

      if (!verified.ok) {
        return verified.reason === 'not-found'
          ? badRequest(
              `No Discogs release with id ${input.discogsReleaseId} exists`,
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

  const existing = await findMatchingPressing(input);
  if (existing !== undefined) {
    return NextResponse.json(existing, { status: 200 });
  }

  try {
    const created = await createPressing({
      ...input,
      catalogNumber: input.catalogNumber ?? null,
      matrixRunout: input.matrixRunout ?? null,
      pressingPlant: input.pressingPlant ?? null,
      yearPressed: input.yearPressed ?? null,
      countryPressed: input.countryPressed ?? null,
      vinylWeightGrams: input.vinylWeightGrams ?? null,
      colorVariant: input.colorVariant ?? null,
      discogsReleaseId: input.discogsReleaseId ?? null,
      notes: input.notes ?? null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    /**
     * A concurrent create claimed the same discogs id. Unlike a reference
     * resource this is NOT a 409: the caller asked for a pressing with that id
     * to exist, and now it does. Resolving to the winning row is what the
     * caller wanted, so this returns 200 like any other find.
     */
    if (isUniqueViolation(error) && input.discogsReleaseId !== null && input.discogsReleaseId !== undefined) {
      const winner = await findPressingByDiscogsId(input.discogsReleaseId);
      if (winner !== undefined) return NextResponse.json(winner, { status: 200 });
    }
    throw error;
  }
});
