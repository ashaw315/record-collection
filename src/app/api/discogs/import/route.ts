import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { readCachedRelease, writeCachedRelease } from '@/lib/discogs/cache';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { normalizeRelease } from '@/lib/discogs/normalize-release';
import { importRelease } from '@/lib/db/queries/discogs-import';

/**
 * SPEC.md §5.7 `POST /api/discogs/import`.
 *
 * **Stage two of a two-stage flow.** §5.7 is explicit: the release endpoint
 * returns the normalized payload, the client renders it into the form, the user
 * verifies against the physical record, and only then is this called with their
 * corrections in `overrides`. "There is no path that writes a record straight
 * from a search result without passing through the form."
 *
 * This endpoint therefore re-fetches the release by id rather than accepting a
 * payload from the client. The reason is §7.8 and CLAUDE.md §8 together: a
 * client-supplied payload could assert anything about a pressing, and the
 * pressing identity is the thing the whole schema exists to keep honest. The
 * user's corrections arrive as `overrides`, which are explicit and bounded.
 */

const overridesSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(500).optional(),
    releaseYear: z.number().int().nullable().optional(),
    conditionMedia: z.string().nullable().optional(),
    conditionSleeve: z.string().nullable().optional(),
    purchasePrice: z
      .string()
      .regex(/^\d{1,8}(\.\d{1,2})?$/, 'purchasePrice must be a decimal amount')
      .nullable()
      .optional(),
    purchaseDate: z.string().nullable().optional(),
    notes: z.string().max(10_000).nullable().optional(),
    matrixRunout: z.string().nullable().optional(),
    catalogNumber: z.string().nullable().optional(),
    countryPressed: z.string().nullable().optional(),
    yearPressed: z.number().int().nullable().optional(),
    pressingPlant: z.string().nullable().optional(),
  })
  .optional();

const importSchema = z.strictObject({
  /**
   * An integer, checked as one. Not `z.coerce.number()` — that accepts
   * '0x50' as 80 and would import a DIFFERENT release than the user verified
   * on screen, which is the §7.7 confusion with the user's own eyes as the
   * thing being contradicted.
   */
  discogsReleaseId: z.number().int().positive(),
  target: z.enum(['record', 'want_list']),
  overrides: overridesSchema,
});

export const POST = withErrorHandling('api.discogs.import.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = importSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { discogsReleaseId, target, overrides } = parsed.data;

  let payload: unknown;

  // Served from cache when fresh: the user has just viewed this release in the
  // form, so the fetch that filled the form is almost always still valid, and
  // spending a second rate-limited call on the same release is waste.
  const cached = await readCachedRelease(discogsReleaseId);

  if (cached !== null) {
    payload = cached.payload;
  } else {
    try {
      payload = await getDiscogsClient().get(`/releases/${discogsReleaseId}`);
      await writeCachedRelease(discogsReleaseId, payload);
    } catch (error) {
      if (error instanceof DiscogsError) return discogsErrorResponse(error);
      throw error;
    }
  }

  const release = normalizeRelease(payload);

  const created = await importRelease({ release, target, overrides });

  return NextResponse.json(created, { status: 201 });
});
