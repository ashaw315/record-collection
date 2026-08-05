import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  badRequest,
  conflictInUse,
  conflictSeeded,
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
  countFormatReferences,
  deleteFormat,
  findFormatById,
  formatNameTakenByOther,
  updateFormat,
} from '@/lib/db/queries/formats';

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

/**
 * `name` only. SPEC.md §4.1: PATCH may rename a seeded format but may not
 * change `is_seeded`, so the field is absent here and strictObject rejects it —
 * clearing the flag would make a seeded row deletable, achieving by PATCH
 * exactly what DELETE refuses.
 */
const patchSchema = z.strictObject({ name: nameSchema });

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.formats.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid format id', 'INVALID_ID');

    const format = await findFormatById(id);
    if (format === undefined) return notFound('Format not found');

    return NextResponse.json(format);
  },
);

export const PATCH = withErrorHandling(
  'api.formats.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid format id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findFormatById(id)) === undefined) return notFound('Format not found');

    const { name } = parsed.data;
    if (await formatNameTakenByOther(id, name)) {
      return duplicate('A format with that name already exists');
    }

    try {
      // Renaming a seeded row is permitted (§4.1); only is_seeded is immutable,
      // and it is not in the schema so it cannot arrive here.
      const updated = await updateFormat(id, name);
      if (updated === undefined) return notFound('Format not found');
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return duplicate('A format with that name already exists');
      }
      throw error;
    }
  },
);

export const DELETE = withErrorHandling(
  'api.formats.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid format id', 'INVALID_ID');

    const existing = await findFormatById(id);
    if (existing === undefined) return notFound('Format not found');

    /**
     * SEEDED takes precedence over IN_USE and is checked before anything else:
     * a seeded row stays undeletable however many records stop referencing it,
     * so reporting IN_USE would tell the user to clear references that would
     * not help. Read from `is_seeded`, never from the name — PATCH may rename a
     * seeded row, and a name-matched guard would stop protecting it silently.
     */
    if (existing.isSeeded) {
      return conflictSeeded('Seeded formats cannot be deleted');
    }

    // Then the ordinary §7.4 pair: pre-check for a helpful 409, foreign key for
    // the guarantee when a reference appears in between.
    const referenceCount = await countFormatReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Format is in use and cannot be deleted', referenceCount);
    }

    const outcome = await deleteFormat(id);
    if (outcome.status === 'not-found') return notFound('Format not found');
    if (outcome.status === 'seeded') return conflictSeeded('Seeded formats cannot be deleted');
    if (outcome.status === 'in-use') {
      return conflictInUse('Format is in use and cannot be deleted', outcome.referenceCount);
    }

    return NextResponse.json({ ok: true });
  },
);
