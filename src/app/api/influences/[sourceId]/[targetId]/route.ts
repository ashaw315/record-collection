import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, invalidPathIds, notFound, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import {
  STRENGTH_MAX,
  STRENGTH_MIN,
  deleteInfluence,
  updateInfluence,
} from '@/lib/db/queries/influences';

/**
 * SPEC.md §5.5. The pair is addressed in the PATH, not a body — a DELETE with a
 * body is poorly supported across clients and caches.
 *
 * Two template assumptions do not apply here:
 *
 *   - `isUuid(id)` guards one segment; this has two, so invalidPathIds names
 *     whichever is malformed rather than returning a bare "invalid id";
 *   - nothing references an edge, so there is no 409 IN_USE and no reference
 *     count. DELETE is 200 or 404.
 */

/**
 * The key is deliberately absent from this schema. It is the edge's identity
 * and lives in the path; accepting it in the body would let a PATCH silently
 * retarget a different edge, and strictObject rejects it.
 */
const patchSchema = z
  .strictObject({
    strength: z.number().int().min(STRENGTH_MIN).max(STRENGTH_MAX).optional(),
    notes: z.string().trim().max(10_000).nullish(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

type Context = { params: Promise<{ sourceId: string; targetId: string }> };

export const PATCH = withErrorHandling(
  'api.influences.[pair].PATCH',
  async (request: Request, context: Context) => {
    const { sourceId, targetId } = await context.params;

    const invalid = invalidPathIds({ sourceId, targetId });
    if (invalid !== undefined) return invalid;

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = patchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    // No separate existence check: the update targets the exact pair, so a
    // missing row and a reversed pair both come back undefined here — which is
    // correct, since a→b existing says nothing about b→a.
    const updated = await updateInfluence(sourceId, targetId, parsed.data);
    if (updated === undefined) return notFound('Influence edge not found');

    return NextResponse.json(updated);
  },
);

export const DELETE = withErrorHandling(
  'api.influences.[pair].DELETE',
  async (_request: Request, context: Context) => {
    const { sourceId, targetId } = await context.params;

    const invalid = invalidPathIds({ sourceId, targetId });
    if (invalid !== undefined) return invalid;

    // Removes exactly one directed edge; the reverse, if it exists, is a
    // different row and is left alone.
    if (!(await deleteInfluence(sourceId, targetId))) {
      return notFound('Influence edge not found');
    }

    return NextResponse.json({ ok: true });
  },
);
