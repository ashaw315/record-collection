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
import {
  countTagReferences,
  deleteTag,
  findTagById,
  nameTakenByOther,
  updateTag,
} from '@/lib/db/queries/tags';

const nameSchema = z.string().trim().min(1).max(100);
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
      return duplicate('A tag with that name already exists');
    }

    try {
      const updated = await updateTag(id, name);
      // Deleted between the existence check and the update.
      if (updated === undefined) return notFound('Tag not found');
      return NextResponse.json(updated);
    } catch (error) {
      if (isUniqueViolation(error)) {
        return duplicate('A tag with that name already exists');
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
     * SPEC.md §7.4: in-use reference rows are never cascade-deleted. This check
     * must happen here rather than being left to a foreign-key error, because
     * `record_tags.tag_id` is ON DELETE CASCADE (§4.3) — Postgres would accept
     * the delete and silently un-tag every record that used it.
     */
    const referenceCount = await countTagReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Tag is in use and cannot be deleted', referenceCount);
    }

    if (!(await deleteTag(id))) return notFound('Tag not found');

    return NextResponse.json({ ok: true });
  },
);
