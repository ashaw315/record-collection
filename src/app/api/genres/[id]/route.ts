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
import {
  countGenreReferences,
  deleteGenre,
  findGenreById,
  genreExists,
  genreNameTakenByOther,
  updateGenre,
  wouldCreateCycle,
} from '@/lib/db/queries/genres';

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const patchSchema = z
  .strictObject({
    name: nameSchema.optional(),
    // `.nullish()` distinguishes "leave alone" (omitted) from "move to root"
    // (explicit null).
    parentGenreId: z.string().uuid().nullish(),
    description: z.string().trim().max(10_000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

type Context = { params: Promise<{ id: string }> };

/** The §5 400 shape for a single field, without a Zod error to flatten. */
function fieldError(field: string, message: string) {
  return NextResponse.json(
    {
      error: {
        message: 'Invalid request',
        code: 'VALIDATION_ERROR',
        fieldErrors: { [field]: message },
      },
    },
    { status: 400 },
  );
}

export const GET = withErrorHandling(
  'api.genres.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid genre id', 'INVALID_ID');

    const genre = await findGenreById(id);
    if (genre === undefined) return notFound('Genre not found');

    return NextResponse.json(genre);
  },
);

export const PATCH = withErrorHandling(
  'api.genres.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid genre id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findGenreById(id)) === undefined) return notFound('Genre not found');

    const { name, parentGenreId } = parsed.data;

    if (name !== undefined && (await genreNameTakenByOther(id, name))) {
      return duplicate('A genre with that name already exists');
    }

    /**
     * SPEC.md §4.1: "a genre may not be its own ancestor."
     *
     * This is the ONLY protection — the database accepts `parent_genre_id = id`
     * and accepts longer cycles just as readily (verified). A cycle would make
     * §7.1's recursive ancestor CTE loop and would drop every genre in the
     * cycle out of the tree endpoint, since none of them would be reachable
     * from a root.
     */
    if (parentGenreId !== null && parentGenreId !== undefined) {
      if (!(await genreExists(parentGenreId))) {
        return fieldError('parentGenreId', 'No genre with that id exists');
      }
      if (await wouldCreateCycle(id, parentGenreId)) {
        return fieldError(
          'parentGenreId',
          'A genre may not be its own ancestor',
        );
      }
    }

    try {
      const updated = await updateGenre(id, parsed.data);
      if (updated === undefined) return notFound('Genre not found');
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return duplicate('A genre with that name already exists');
      }
      throw error;
    }
  },
);

export const DELETE = withErrorHandling(
  'api.genres.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid genre id', 'INVALID_ID');

    if ((await findGenreById(id)) === undefined) return notFound('Genre not found');

    // Four referrers, including this table's own parent_genre_id: a genre with
    // child genres is in use and must not be deleted out from under them.
    const referenceCount = await countGenreReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Genre is in use and cannot be deleted', referenceCount);
    }

    const outcome = await deleteGenre(id);
    if (outcome.status === 'not-found') return notFound('Genre not found');
    if (outcome.status === 'in-use') {
      return conflictInUse('Genre is in use and cannot be deleted', outcome.referenceCount);
    }

    return NextResponse.json({ ok: true });
  },
);
