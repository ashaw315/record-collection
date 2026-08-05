import { NextResponse } from 'next/server';
import { z } from 'zod';
import { duplicate, invalidJson, isUniqueViolation, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { NAME_MAX_LENGTH, cleanName, nameLength } from '@/lib/api/text';
import { parseListParams } from '@/lib/api/query-params';
import {
  FORMAT_SORT_FIELDS,
  createFormat,
  findFormatByName,
  listFormats,
} from '@/lib/db/queries/formats';

/**
 * SPEC.md §5.4 reference CRUD for `formats`.
 *
 * `isSeeded` is absent from this schema deliberately, not by omission: it is
 * set only by migration 0002, and strictObject therefore rejects any request
 * carrying it. A client that could set it could mint an undeletable format.
 */

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const createSchema = z.strictObject({ name: nameSchema });

export const GET = withErrorHandling('api.formats.GET', async (request: Request) => {
  const params = parseListParams(new URL(request.url).searchParams, FORMAT_SORT_FIELDS);
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
  const { rows, total } = await listFormats({ limit: pageSize, offset, sort });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize } });
});

export const POST = withErrorHandling('api.formats.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { name } = parsed.data;

  if ((await findFormatByName(name)) !== undefined) {
    return duplicate('A format with that name already exists');
  }

  try {
    return NextResponse.json(await createFormat(name), { status: 201 });
  } catch (error) {
    if (isUniqueViolation(error)) {
      return duplicate('A format with that name already exists');
    }
    throw error;
  }
});
