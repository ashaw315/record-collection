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
  countLabelReferences,
  deleteLabel,
  findLabelById,
  labelNameTakenByOther,
  updateLabel,
} from '@/lib/db/queries/labels';

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

/**
 * Every field optional, but at least one required. `.nullish()` on the nullable
 * fields is what lets a client distinguish "leave alone" (omitted) from "clear"
 * (explicit null) — without it there is no way to remove a wrong Discogs id.
 */
const patchSchema = z
  .strictObject({
    name: nameSchema.optional(),
    notes: z.string().trim().max(10_000).nullish(),
    discogsLabelId: z.number().int().positive().max(Number.MAX_SAFE_INTEGER).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.labels.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid label id', 'INVALID_ID');

    const label = await findLabelById(id);
    if (label === undefined) return notFound('Label not found');

    return NextResponse.json(label);
  },
);

export const PATCH = withErrorHandling(
  'api.labels.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid label id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findLabelById(id)) === undefined) return notFound('Label not found');

    const { name } = parsed.data;
    if (name !== undefined && (await labelNameTakenByOther(id, name))) {
      return duplicate('A label with that name already exists');
    }

    try {
      const updated = await updateLabel(id, parsed.data);
      // Deleted between the existence check and the update.
      if (updated === undefined) return notFound('Label not found');
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return duplicate('A label with that name or Discogs id already exists');
      }
      throw error;
    }
  },
);

export const DELETE = withErrorHandling(
  'api.labels.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid label id', 'INVALID_ID');

    if ((await findLabelById(id)) === undefined) return notFound('Label not found');

    /**
     * SPEC.md §7.4, two layers and neither redundant: the pre-check produces a
     * helpful 409 without attempting a write, and the NO ACTION foreign keys are
     * the actual guarantee for the case where a reference appears in between.
     */
    const referenceCount = await countLabelReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Label is in use and cannot be deleted', referenceCount);
    }

    const outcome = await deleteLabel(id);
    if (outcome.status === 'not-found') return notFound('Label not found');
    if (outcome.status === 'in-use') {
      return conflictInUse('Label is in use and cannot be deleted', outcome.referenceCount);
    }

    return NextResponse.json({ ok: true });
  },
);
