import { NextResponse } from 'next/server';
import { z } from 'zod';
import { NAME_MAX_LENGTH, cleanName, nameLength } from '@/lib/api/text';
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
import {
  countTagReferences,
  deleteTag,
  findTagById,
  findTagByName,
  nameTakenByOther,
  updateTag,
} from '@/lib/db/queries/tags';

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
const patchSchema = z.strictObject({ name: nameSchema });

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.tags.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid tag id', 'INVALID_ID');

    const tag = await findTagById(id);
    if (tag === undefined) return notFound('Tag not found');

    return NextResponse.json(tag);
  },
);

export const PATCH = withErrorHandling(
  'api.tags.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid tag id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findTagById(id)) === undefined) return notFound('Tag not found');

    const { name } = parsed.data;
    if (await nameTakenByOther(id, name)) {
      const clash = await findTagByName(name);
      return duplicate('A tag with that name already exists', clash?.id ?? id);
    }

    try {
      const updated = await updateTag(id, name);
      // Deleted between the existence check and the update.
      if (updated === undefined) return notFound('Tag not found');
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        /**
         * §5.4 requires existingId from the RECOVERY path too — a
         * concurrent write won the race, and the caller still needs to
         * be able to select what it lost to. Re-read by name: the row
         * now exists, which is why we are here.
         */
        const winner = name === undefined ? undefined : await findTagByName(name);
        return duplicate('A tag with that name already exists', winner?.id ?? '');
      }
      throw error;
    }
  },
);

export const DELETE = withErrorHandling(
  'api.tags.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid tag id', 'INVALID_ID');

    if ((await findTagById(id)) === undefined) return notFound('Tag not found');

    /**
     * SPEC.md §7.4: an in-use reference row is refused with 409, never
     * cascade-deleted.
     *
     * Two layers, and both are needed. The pre-check produces a helpful 409
     * without attempting a write in the ordinary case. It is NOT the guarantee,
     * because it is not atomic with the delete: a concurrent insert into
     * record_tags lands between them. The guarantee is the NO ACTION foreign key
     * (§4.3), which deleteTag translates from a 23503 into the same 409 with a
     * freshly-read count.
     */
    const referenceCount = await countTagReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Tag is in use and cannot be deleted', referenceCount);
    }

    const outcome = await deleteTag(id);
    if (outcome.status === 'not-found') return notFound('Tag not found');
    if (outcome.status === 'in-use') {
      return conflictInUse('Tag is in use and cannot be deleted', outcome.referenceCount);
    }

    return NextResponse.json({ ok: true });
  },
);
