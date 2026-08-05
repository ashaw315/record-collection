import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  duplicate,
  invalidJson,
  isUniqueViolation,
  validationError,
} from '@/lib/api/errors';
import { parseListParams } from '@/lib/api/query-params';
import { TAG_SORT_FIELDS, createTag, findTagByName, listTags } from '@/lib/db/queries/tags';

/**
 * SPEC.md §5.4 reference CRUD for `tags`. Validation happens here at the
 * boundary; every database access goes through @/lib/db/queries/tags
 * (CLAUDE.md §6).
 */

// Trimmed before length is checked, so "   " is rejected rather than stored as
// whitespace, and " signed" cannot shadow an existing "signed".
const nameSchema = z.string().trim().min(1).max(100);

const createSchema = z.strictObject({ name: nameSchema });

export async function GET(request: Request) {
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
}

export async function POST(request: Request) {
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
}
