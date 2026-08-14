import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  duplicate,
  invalidJson,
  isUniqueViolation,
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
  findArtistsNamed,
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

  /**
   * §4.1 as amended: the name constraint is gone, and this check survives it.
   *
   * Typing a name you already have is far more often a mistake than a genuine
   * second band, so the warning stays — but it is now a QUESTION the client may
   * override rather than a refusal the database enforced. The count travels
   * with it: "you already have 2 artists named Discharge" is honest, where
   * pointing at one of the two as though it were the one is not.
   */
  const existing = await findArtistsNamed(name);
  if (existing.length > 0) {
    return duplicate(
      existing.length === 1
        ? 'An artist with that name already exists'
        : `${existing.length} artists with that name already exist`,
      existing[0].id,
      existing.length,
    );
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
      /**
       * **Only `discogs_artist_id` can collide now**, so the name branch that
       * used to sit here is gone rather than left unreachable — a branch that
       * cannot be entered reads as maintained, which is how a dead
       * `isUniqueViolation` survived a whole build unit here once already.
       *
       * §5.4 requires `existingId` from the RECOVERY path too: a concurrent
       * write won the race and the caller still needs to reach what it lost to.
       *
       * **This is why artists differ from labels and genres**, whose recovery
       * paths still re-read by name. Those tables keep their unique names
       * because a label IS its name; two bands genuinely share one (§4.1). The
       * asymmetry is deliberate, not an oversight.
       */
      const winner = await findArtistByDiscogsId(discogsArtistId ?? null);

      if (winner === undefined) throw error;
      return duplicate('An artist with that Discogs id already exists', winner.id);
    }
    throw error;
  }
});
