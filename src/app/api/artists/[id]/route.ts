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
import { NAME_MAX_LENGTH, cleanName, nameLength } from '@/lib/api/text';
import { formedYearSchema } from '@/lib/api/year';
import {
  countArtistReferences,
  deleteArtist,
  findArtistById,
  findArtistByDiscogsId,
  findArtistsNamed,
  updateArtist,
} from '@/lib/db/queries/artists';

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const optionalText = z.string().trim().max(10_000).nullish();

/**
 * `formedYear` reuses the shared schema rather than restating the bound. A
 * second copy is how the two endpoints drift — the bound is easy to wire into
 * create and forget on update, which is why there is a test for exactly that.
 */
const patchSchema = z
  .strictObject({
    name: nameSchema.optional(),
    formedYear: formedYearSchema,
    originCountry: optionalText,
    notes: optionalText,
    discogsArtistId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.artists.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid artist id', 'INVALID_ID');

    const artist = await findArtistById(id);
    if (artist === undefined) return notFound('Artist not found');

    return NextResponse.json(artist);
  },
);

export const PATCH = withErrorHandling(
  'api.artists.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid artist id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findArtistById(id)) === undefined) return notFound('Artist not found');

    /**
     * §4.1 as amended: renaming an artist into a name another artist already
     * has is LEGAL now — two bands are called Discharge.
     *
     * The warning matches POST's exactly, and deliberately: keeping the old
     * hard refusal here would let a user create a second Discharge but not
     * rename into one, which is incoherent. Soft 409 with the count, the client
     * may override.
     */
    const { name } = parsed.data;
    if (name !== undefined) {
      const clashes = (await findArtistsNamed(name)).filter((artist) => artist.id !== id);
      if (clashes.length > 0) {
        return duplicate(
          clashes.length === 1
            ? 'An artist with that name already exists'
            : `${clashes.length} artists with that name already exist`,
          clashes[0].id,
          clashes.length,
        );
      }
    }

    try {
      const updated = await updateArtist(id, parsed.data);
      if (updated === undefined) return notFound('Artist not found');
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        /**
         * §5.4 requires `existingId` from the RECOVERY path too — a concurrent
         * write won the race and the caller still needs to reach what it lost
         * to.
         *
         * **Only `discogs_artist_id` and `musicbrainz_id` can collide now.**
         * The name branch that re-read here is gone rather than left
         * unreachable: its own comment said "the row now exists, which is why
         * we are here", which stopped being true when §4.1 dropped the
         * constraint. Labels and genres keep theirs because a label IS its
         * name; two bands genuinely share one.
         */
        const winner = await findArtistByDiscogsId(parsed.data.discogsArtistId ?? null);
        return duplicate('An artist with that Discogs id already exists', winner?.id ?? '');
      }
      throw error;
    }
  },
);

export const DELETE = withErrorHandling(
  'api.artists.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid artist id', 'INVALID_ID');

    if ((await findArtistById(id)) === undefined) return notFound('Artist not found');

    /**
     * Two blocking referrers. The three CASCADING ones — artist_genres and both
     * artist_influences FKs — are deliberately not counted: an artist whose
     * only links are influence edges is deletable, and refusing that would be
     * the inverse error.
     */
    const referenceCount = await countArtistReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Artist is in use and cannot be deleted', referenceCount);
    }

    const outcome = await deleteArtist(id);
    if (outcome.status === 'not-found') return notFound('Artist not found');
    if (outcome.status === 'in-use') {
      return conflictInUse('Artist is in use and cannot be deleted', outcome.referenceCount);
    }

    return NextResponse.json({ ok: true });
  },
);
