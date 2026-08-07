import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  duplicate,
  invalidJson,
  isUniqueViolation,
  uniqueConstraintName,
  validationError,
} from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { NAME_MAX_LENGTH, cleanName, nameLength } from '@/lib/api/text';
import { formedYearSchema } from '@/lib/api/year';
import { parseListParams } from '@/lib/api/query-params';
import {
  ARTIST_SORT_FIELDS,
  createArtist,
  findArtistByDiscogsId,
  findArtistByName,
  listArtists,
} from '@/lib/db/queries/artists';

/**
 * SPEC.md §5.4 reference CRUD for `artists`.
 */

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const discogsIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullish();
const optionalText = z.string().trim().max(10_000).nullish();

const createSchema = z.strictObject({
  name: nameSchema,
  formedYear: formedYearSchema,
  originCountry: optionalText,
  notes: optionalText,
  discogsArtistId: discogsIdSchema,
});

export const GET = withErrorHandling('api.artists.GET', async (request: Request) => {
  const params = parseListParams(new URL(request.url).searchParams, ARTIST_SORT_FIELDS);
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
  const { rows, total } = await listArtists({ limit: pageSize, offset, sort });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize } });
});

export const POST = withErrorHandling('api.artists.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { name, formedYear, originCountry, notes, discogsArtistId } = parsed.data;

  const existing = await findArtistByName(name);
  if (existing !== undefined) {
    return duplicate('An artist with that name already exists', existing.id);
  }

  try {
    const created = await createArtist({
      name,
      formedYear: formedYear ?? null,
      originCountry: originCountry ?? null,
      notes: notes ?? null,
      discogsArtistId: discogsArtistId ?? null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    // Covers both unique constraints: the name pre-check is not a lock, and
    // discogsArtistId is not pre-checked at all.
    if (isUniqueViolation(error)) {
      /**
       * §5.4 requires existingId from the RECOVERY path too — a concurrent
       * write won the race and the caller still needs to reach what it lost to.
       *
       * WHICH constraint failed decides how to find the winner. This catch
       * covers two: the name (pre-checked, but the check is not a lock) and
       * discogsArtistId (never pre-checked — the partial unique index is its
       * only guard). Re-reading by name after a Discogs-id collision finds
       * nothing, so the constraint has to be inspected rather than assumed.
       */
      const constraint = uniqueConstraintName(error);
      const winner =
        constraint?.includes('discogs_artist_id') === true
          ? await findArtistByDiscogsId(discogsArtistId ?? null)
          : await findArtistByName(name);

      if (winner === undefined) throw error;
      return duplicate('An artist with that name or Discogs id already exists', winner.id);
    }
    throw error;
  }
});
