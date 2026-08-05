import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { NAME_MAX_LENGTH, cleanName, nameLength } from '@/lib/api/text';
import { parseListParams } from '@/lib/api/query-params';
import { STORE_SORT_FIELDS, createStore, listStores } from '@/lib/db/queries/stores';

/**
 * SPEC.md §5.4 reference CRUD for `record_stores`, mounted at /api/stores.
 *
 * No duplicate-name handling anywhere in this file: §4.1 gives `name` no unique
 * constraint, deliberately — two shops can share a name in different cities.
 */

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const optionalText = z.string().trim().max(10_000).nullish();

export const storeFields = {
  name: nameSchema,
  city: optionalText,
  stateRegion: optionalText,
  country: optionalText,
  address: optionalText,
  website: optionalText,
  notes: optionalText,
  isFavorite: z.boolean().optional(),
};

const createSchema = z.strictObject(storeFields);

export const GET = withErrorHandling('api.stores.GET', async (request: Request) => {
  const params = parseListParams(new URL(request.url).searchParams, STORE_SORT_FIELDS);
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
  const { rows, total } = await listStores({ limit: pageSize, offset, sort });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize } });
});

export const POST = withErrorHandling('api.stores.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const created = await createStore(parsed.data);
  return NextResponse.json(created, { status: 201 });
});
