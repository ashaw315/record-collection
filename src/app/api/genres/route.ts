import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  badRequest,
  duplicate,
  invalidJson,
  isUniqueViolation,
  isUuid,
  validationError,
} from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { NAME_MAX_LENGTH, cleanName, nameLength } from '@/lib/api/text';
import { parseListParams } from '@/lib/api/query-params';
import {
  GENRE_SORT_FIELDS,
  createGenre,
  findGenreByName,
  genreExists,
  listGenreTree,
  listGenres,
} from '@/lib/db/queries/genres';

/**
 * SPEC.md §5.4 reference CRUD for `genres`, plus `?tree=true`.
 */

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const createSchema = z.strictObject({
  name: nameSchema,
  parentGenreId: z.string().uuid().nullish(),
  description: z.string().trim().max(10_000).nullish(),
});

export const GET = withErrorHandling('api.genres.GET', async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;
  const rawTree = searchParams.get('tree');

  /**
   * `tree` is accepted only as the exact string "true". `?tree=false` silently
   * meaning "flat" would make a typo change the response SHAPE without warning,
   * and the two shapes are not interchangeable.
   */
  if (rawTree !== null && rawTree !== 'true') {
    return NextResponse.json(
      {
        error: {
          message: 'Invalid query parameters',
          code: 'VALIDATION_ERROR',
          fieldErrors: { tree: 'tree must be true, or omitted' },
        },
      },
      { status: 400 },
    );
  }

  if (rawTree === 'true') {
    // No pagination: a page boundary would cut subtrees and return children
    // whose parents are on another page. `meta` carries only the total, so a
    // client cannot mistake this for a pageable list.
    const { nodes, total } = await listGenreTree();
    return NextResponse.json({ data: nodes, meta: { total } });
  }

  const params = parseListParams(searchParams, GENRE_SORT_FIELDS);
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
  const { rows, total } = await listGenres({ limit: pageSize, offset, sort });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize } });
});

export const POST = withErrorHandling('api.genres.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { name, parentGenreId, description } = parsed.data;

  // Checked here rather than left to the foreign key: a dangling parent is a
  // client mistake (400 with a field error), not a server failure.
  if (parentGenreId !== null && parentGenreId !== undefined) {
    if (!isUuid(parentGenreId)) return badRequest('Invalid parent genre id', 'INVALID_ID');
    if (!(await genreExists(parentGenreId))) {
      return NextResponse.json(
        {
          error: {
            message: 'Invalid request',
            code: 'VALIDATION_ERROR',
            fieldErrors: { parentGenreId: 'No genre with that id exists' },
          },
        },
        { status: 400 },
      );
    }
  }

  if ((await findGenreByName(name)) !== undefined) {
    return duplicate('A genre with that name already exists');
  }

  try {
    const created = await createGenre({
      name,
      parentGenreId: parentGenreId ?? null,
      description: description ?? null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return duplicate('A genre with that name already exists');
    }
    throw error;
  }
});
