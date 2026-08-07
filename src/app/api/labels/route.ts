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
import { parseListParams } from '@/lib/api/query-params';
import {
  LABEL_SORT_FIELDS,
  createLabel,
  findLabelByDiscogsId,
  findLabelByName,
  listLabels,
} from '@/lib/db/queries/labels';

/**
 * SPEC.md §5.4 reference CRUD for `labels`. Validation at the boundary; all
 * database access via @/lib/db/queries/labels (CLAUDE.md §6).
 */

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const notesSchema = z.string().trim().max(10_000).nullish();

// Discogs ids are positive integers. Bounded by MAX_SAFE_INTEGER for the same
// reason `page` is: a larger value loses precision through Number() and reaches
// Postgres as something it will reject.
const discogsIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullish();

const createSchema = z.strictObject({
  name: nameSchema,
  notes: notesSchema,
  discogsLabelId: discogsIdSchema,
});

export const GET = withErrorHandling('api.labels.GET', async (request: Request) => {
  const params = parseListParams(new URL(request.url).searchParams, LABEL_SORT_FIELDS);
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
  const { rows, total } = await listLabels({ limit: pageSize, offset, sort });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize } });
});

export const POST = withErrorHandling('api.labels.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { name, notes, discogsLabelId } = parsed.data;

  const existing = await findLabelByName(name);
  if (existing !== undefined) {
    return duplicate('A label with that name already exists', existing.id);
  }

  try {
    const created = await createLabel({
      name,
      notes: notes ?? null,
      discogsLabelId: discogsLabelId ?? null,
    });
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    // Covers both unique constraints: the name pre-check above is not a lock,
    // and discogsLabelId is not pre-checked at all — the partial unique index
    // (§4.1) is its only guard.
    if (isUniqueViolation(error)) {
      /**
       * §5.4 requires existingId from the RECOVERY path too — a concurrent
       * write won the race and the caller still needs to reach what it lost to.
       *
       * WHICH constraint failed decides how to find the winner. This catch
       * covers two: the name (pre-checked, but the check is not a lock) and
       * discogsLabelId (never pre-checked — the partial unique index is its
       * only guard). Re-reading by name after a Discogs-id collision finds
       * nothing, so the constraint has to be inspected rather than assumed.
       */
      const constraint = uniqueConstraintName(error);
      const winner =
        constraint?.includes('discogs_label_id') === true
          ? await findLabelByDiscogsId(discogsLabelId ?? null)
          : await findLabelByName(name);

      if (winner === undefined) throw error;
      return duplicate('A label with that name or Discogs id already exists', winner.id);
    }
    throw error;
  }
});
