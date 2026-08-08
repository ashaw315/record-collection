import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { parseListParams } from '@/lib/api/query-params';
import { findArtistById } from '@/lib/db/queries/artists';
import { findLabelById } from '@/lib/db/queries/labels';
import { findPressingById } from '@/lib/db/queries/pressings';
import { missingIds } from '@/lib/db/queries/records';
import {
  createWantListItem,
  listWantList,
  type WantListFilters,
} from '@/lib/db/queries/want-list';

/**
 * SPEC.md §5.3 `/api/want-list`.
 *
 * §7.3 governs the whole resource: acquiring never deletes a row, so the list
 * doubles as acquisition history and the default MUST exclude acquired items.
 *
 * §7.2 governs two of its fields: `bestDigNotes` describes the pressing worth
 * hunting for and `maxPrice` is the user's ceiling. They are unrelated
 * (CLAUDE.md §8) and nothing here derives one from the other.
 */

const uuid = z.string().uuid();

/**
 * §4.2: "1 = highest, 5 = lowest". There is NO database CHECK — verified
 * against pg_constraint — so this boundary is the only thing standing between
 * a typo and a want list sorted by a priority of 99.
 */
const prioritySchema = z
  .number()
  .int()
  .min(1, 'Priority must be between 1 and 5')
  .max(5, 'Priority must be between 1 and 5');

const createSchema = z.strictObject({
  title: z.string().trim().min(1).max(500),
  artistId: uuid,
  labelId: uuid.nullish(),
  priority: prioritySchema.optional(),
  targetPressingId: uuid.nullish(),
  // Free text about the PRESSING, never a price (§7.2).
  bestDigNotes: z.string().trim().max(10_000).nullish(),
  // NUMERIC(10,2) as a string: a float would silently lose pence.
  maxPrice: z
    .string()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, 'maxPrice must be a decimal amount')
    .nullish(),
  genreIds: z.array(uuid).max(200).optional(),
});

/**
 * Query-parameter validation.
 *
 * `isAcquired` is an ENUM transformed to boolean, never `z.coerce.boolean()`,
 * which treats every non-empty string as true — so `isAcquired=false` would
 * mean TRUE and the list would show only records the user already owns. The
 * coercion class recorded in NOTES, third instance.
 */
const filterSchema = z.strictObject({
  artistId: uuid.optional(),
  genreId: uuid.optional(),
  priority: z
    .string()
    .refine((value) => /^\d+$/.test(value), 'Priority must be between 1 and 5')
    .transform(Number)
    .refine((value) => value >= 1 && value <= 5, 'Priority must be between 1 and 5')
    .optional(),
  isAcquired: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
});

/** §5.3 lists no sortable fields: the order is priority, always. */
const NO_SORT_FIELDS = [] as const;

export const GET = withErrorHandling('api.want-list.GET', async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;

  const params = parseListParams(searchParams, NO_SORT_FIELDS);
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

  const raw: Record<string, string> = {};
  for (const key of ['artistId', 'genreId', 'priority', 'isAcquired']) {
    const value = searchParams.get(key);
    if (value !== null) raw[key] = value;
  }

  const filters = filterSchema.safeParse(raw);
  if (!filters.success) return validationError(filters.error);

  const { page, pageSize, offset } = params.value;
  const { rows, total } = await listWantList({
    limit: pageSize,
    offset,
    filters: filters.data as WantListFilters,
  });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize } });
});

export const POST = withErrorHandling('api.want-list.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { genreIds = [], ...values } = parsed.data;

  /**
   * Every relation checked here, so a bad id is a 400 naming its field rather
   * than a foreign-key violation shaped into a 500. Each check names ITSELF —
   * "invalid request" alone leaves the client guessing which of three was wrong.
   */
  const fieldErrors: Record<string, string> = {};

  if ((await findArtistById(values.artistId)) === undefined) {
    fieldErrors.artistId = 'No artist with that id exists';
  }
  if (values.labelId != null && (await findLabelById(values.labelId)) === undefined) {
    fieldErrors.labelId = 'No label with that id exists';
  }
  if (
    values.targetPressingId != null &&
    (await findPressingById(values.targetPressingId)) === undefined
  ) {
    fieldErrors.targetPressingId = 'No pressing with that id exists';
  }

  const missingGenres = await missingIds('genres', genreIds);
  if (missingGenres.length > 0) {
    fieldErrors.genreIds = `No genre with id ${missingGenres[0]} exists`;
  }

  if (Object.keys(fieldErrors).length > 0) {
    return NextResponse.json(
      { error: { message: 'Invalid request', code: 'VALIDATION_ERROR', fieldErrors } },
      { status: 400 },
    );
  }

  const created = await createWantListItem({
    values: {
      artistId: values.artistId,
      title: values.title,
      labelId: values.labelId ?? null,
      priority: values.priority,
      targetPressingId: values.targetPressingId ?? null,
      bestDigNotes: values.bestDigNotes ?? null,
      maxPrice: values.maxPrice ?? null,
    },
    genreIds,
  });

  return NextResponse.json(created, { status: 201 });
});
