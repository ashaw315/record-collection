import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NAME_MAX_LENGTH, cleanName, nameLength } from '@/lib/api/text';
import {
  duplicate,
  invalidJson,
  isUniqueViolation,
  validationError,
} from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { parseListParams } from '@/lib/api/query-params';
import { TAG_SORT_FIELDS, createTag, findTagByName, listTags } from '@/lib/db/queries/tags';

/**
 * SPEC.md §5.4 reference CRUD for `tags`. Validation happens here at the
 * boundary; every database access goes through @/lib/db/queries/tags
 * (CLAUDE.md §6).
 */

// Names are normalized before length and emptiness are checked, so an NFD form
// collides with its NFC twin, an invisible character cannot shadow a real name,
// and "   " is rejected rather than stored. See @/lib/api/text for why Postgres
// alone does not do this.
const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const createSchema = z.strictObject({ name: nameSchema });

export const GET = withErrorHandling('api.tags.GET', async (request: Request) => {
  const params = parseListParams(new URL(request.url).searchParams, TAG_SORT_FIELDS);
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
  const { rows, total } = await listTags({ limit: pageSize, offset, sort });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize } });
});

export const POST = withErrorHandling('api.tags.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { name } = parsed.data;

  if ((await findTagByName(name)) !== undefined) {
    return duplicate('A tag with that name already exists');
  }

  try {
    return NextResponse.json(await createTag(name), { status: 201 });
  } catch (error) {
    // The pre-check above is not a lock: two concurrent creates can both pass it
    // and one will lose to the unique index. Same 409 either way.
    if (isUniqueViolation(error)) {
      return duplicate('A tag with that name already exists');
    }
    throw error;
  }
});
