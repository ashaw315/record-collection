import { NextResponse } from 'next/server';
import { z } from 'zod';
import {
  badRequest,
  conflictInUse,
  invalidJson,
  isUuid,
  notFound,
  validationError,
} from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { NAME_MAX_LENGTH, cleanName, nameLength } from '@/lib/api/text';
import {
  countStoreReferences,
  deleteStore,
  findStoreById,
  updateStore,
} from '@/lib/db/queries/stores';

const nameSchema = z
  .string()
  .transform(cleanName)
  .refine((value) => value.length > 0, { message: 'Name is required' })
  .refine((value) => nameLength(value) <= NAME_MAX_LENGTH, {
    message: `Name must be at most ${NAME_MAX_LENGTH} characters`,
  });

const optionalText = z.string().trim().max(10_000).nullish();

// `.nullish()` throughout so a client can distinguish "leave alone" (omitted)
// from "clear" (explicit null).
const patchSchema = z
  .strictObject({
    name: nameSchema.optional(),
    city: optionalText,
    stateRegion: optionalText,
    country: optionalText,
    address: optionalText,
    website: optionalText,
    notes: optionalText,
    isFavorite: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.stores.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid store id', 'INVALID_ID');

    const store = await findStoreById(id);
    if (store === undefined) return notFound('Store not found');

    return NextResponse.json(store);
  },
);

export const PATCH = withErrorHandling(
  'api.stores.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid store id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findStoreById(id)) === undefined) return notFound('Store not found');

    // No name-collision check: §4.1 gives this table no unique constraint, and
    // rejecting a shared name would refuse legitimate data (chains exist).
    const updated = await updateStore(id, parsed.data);
    if (updated === undefined) return notFound('Store not found');

    return NextResponse.json(updated);
  },
);

export const DELETE = withErrorHandling(
  'api.stores.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid store id', 'INVALID_ID');

    if ((await findStoreById(id)) === undefined) return notFound('Store not found');

    const referenceCount = await countStoreReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Store is in use and cannot be deleted', referenceCount);
    }

    const outcome = await deleteStore(id);
    if (outcome.status === 'not-found') return notFound('Store not found');
    if (outcome.status === 'in-use') {
      return conflictInUse('Store is in use and cannot be deleted', outcome.referenceCount);
    }

    return NextResponse.json({ ok: true });
  },
);
