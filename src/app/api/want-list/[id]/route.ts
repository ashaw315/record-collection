import { NextResponse } from 'next/server';
import { badRequest, invalidJson, isUuid, notFound, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { findArtistById } from '@/lib/db/queries/artists';
import { findLabelById } from '@/lib/db/queries/labels';
import { findPressingById } from '@/lib/db/queries/pressings';
import { missingIds } from '@/lib/db/queries/records';
import {
  deleteWantListItem,
  findWantListItemById,
  hydrateWantListItem,
  updateWantListItem,
} from '@/lib/db/queries/want-list';
import { wantListPatchSchema } from './schema';

/** SPEC.md §5.3's `:id` routes. */

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.want-list.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid want-list id', 'INVALID_ID');

    const item = await hydrateWantListItem(id);
    if (item === undefined) return notFound('Want-list item not found');

    return NextResponse.json(item);
  },
);

export const PATCH = withErrorHandling(
  'api.want-list.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid want-list id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = wantListPatchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findWantListItemById(id)) === undefined) {
      return notFound('Want-list item not found');
    }

    const { genreIds, ...scalars } = parsed.data;

    // Every relation named individually, so a bad id is a 400 naming its field
    // rather than a foreign-key violation shaped into a 500.
    const fieldErrors: Record<string, string> = {};

    if (scalars.artistId !== undefined && (await findArtistById(scalars.artistId)) === undefined) {
      fieldErrors.artistId = 'No artist with that id exists';
    }
    if (scalars.labelId != null && (await findLabelById(scalars.labelId)) === undefined) {
      fieldErrors.labelId = 'No label with that id exists';
    }
    if (
      scalars.targetPressingId != null &&
      (await findPressingById(scalars.targetPressingId)) === undefined
    ) {
      fieldErrors.targetPressingId = 'No pressing with that id exists';
    }
    if (genreIds !== undefined) {
      const missing = await missingIds('genres', genreIds);
      if (missing.length > 0) fieldErrors.genreIds = `No genre with id ${missing[0]} exists`;
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: { message: 'Invalid request', code: 'VALIDATION_ERROR', fieldErrors } },
        { status: 400 },
      );
    }

    /**
     * Both writes in ONE transaction. Step 5's records PATCH ran them
     * separately and committed the scalar update behind a 500 when the nested
     * write failed; the same shape is available here.
     */
    await updateWantListItem({ id, values: scalars, genreIds });

    const updated = await hydrateWantListItem(id);
    if (updated === undefined) return notFound('Want-list item not found');

    return NextResponse.json(updated);
  },
);

export const DELETE = withErrorHandling(
  'api.want-list.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid want-list id', 'INVALID_ID');

    /**
     * No 409 case, unlike the reference resources: both referrers cascade, so
     * a delete always succeeds. The target pressing is NOT removed — pressings
     * are shared (§4).
     */
    if (!(await deleteWantListItem(id))) return notFound('Want-list item not found');

    return NextResponse.json({ ok: true });
  },
);
