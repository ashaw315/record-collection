import { NextResponse } from 'next/server';
import {
  badRequest,
  conflict,
  invalidJson,
  isConflictError,
  isUuid,
  notFound,
  validationError,
} from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { recordCreateSchema } from '@/lib/records/create-schema';
import { findArtistById } from '@/lib/db/queries/artists';
import { findLabelById } from '@/lib/db/queries/labels';
import { findFormatById } from '@/lib/db/queries/formats';
import { findStoreById } from '@/lib/db/queries/stores';
import { findPressingById } from '@/lib/db/queries/pressings';
import { missingIds } from '@/lib/db/queries/records';
import { acquireWantListItem, findWantListItemById } from '@/lib/db/queries/want-list';

/**
 * SPEC.md §5.3 `POST /api/want-list/:id/acquire`.
 *
 * §7.3: the want-list row is NEVER deleted. It is marked acquired and linked to
 * the new record, because the want list doubles as acquisition history.
 *
 * The whole operation is one transaction in `acquireWantListItem` — see there
 * for why a partial application corrupts silently rather than erroring.
 */

type Context = { params: Promise<{ id: string }> };

export const POST = withErrorHandling(
  'api.want-list.[id].acquire.POST',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid want-list id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    // The SAME schema POST /api/records uses (§5.3: "full record payload"), so
    // acquiring cannot become a lesser way to create a record.
    const parsed = recordCreateSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const item = await findWantListItemById(id);
    if (item === undefined) return notFound('Want-list item not found');

    if (item.isAcquired) {
      /**
       * Acquiring twice would overwrite `acquired_record_id` and orphan the
       * first record — losing an acquisition that actually happened. The
       * transaction guards this too, on `is_acquired = false`; this check
       * exists to return a legible 409 rather than a 500.
       */
      return NextResponse.json(
        {
          error: {
            message: 'That want-list item has already been acquired',
            code: 'ALREADY_ACQUIRED',
          },
        },
        { status: 409 },
      );
    }

    const { genreIds = [], tagIds = [], ...values } = parsed.data;

    const fieldErrors: Record<string, string> = {};

    if ((await findArtistById(values.artistId)) === undefined) {
      fieldErrors.artistId = 'No artist with that id exists';
    }
    if (values.labelId != null && (await findLabelById(values.labelId)) === undefined) {
      fieldErrors.labelId = 'No label with that id exists';
    }
    if (values.formatId != null && (await findFormatById(values.formatId)) === undefined) {
      fieldErrors.formatId = 'No format with that id exists';
    }
    if (values.storeId != null && (await findStoreById(values.storeId)) === undefined) {
      fieldErrors.storeId = 'No store with that id exists';
    }
    if (values.pressingId != null && (await findPressingById(values.pressingId)) === undefined) {
      fieldErrors.pressingId = 'No pressing with that id exists';
    }

    const missingGenres = await missingIds('genres', genreIds);
    if (missingGenres.length > 0) {
      fieldErrors.genreIds = `No genre with id ${missingGenres[0]} exists`;
    }
    const missingTags = await missingIds('tags', tagIds);
    if (missingTags.length > 0) {
      fieldErrors.tagIds = `No tag with id ${missingTags[0]} exists`;
    }

    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: { message: 'Invalid request', code: 'VALIDATION_ERROR', fieldErrors } },
        { status: 400 },
      );
    }

    /**
     * The pre-check above handles the ordinary repeat. This handles the RACE it
     * cannot close (§5.3): two callers both read `is_acquired = false`, both
     * reach here, and the transaction's guard rejects the second. Same
     * conflict, same 409 — only the timing differs, and a user who was half a
     * second late should not be told the app broke.
     */
    let record;
    try {
      record = await acquireWantListItem({
        wantListId: id,
        values: {
          artistId: values.artistId,
          title: values.title,
          labelId: values.labelId ?? null,
          formatId: values.formatId ?? null,
          pressingId: values.pressingId ?? null,
          storeId: values.storeId ?? null,
          releaseYear: values.releaseYear ?? null,
          conditionMedia: values.conditionMedia ?? null,
          conditionSleeve: values.conditionSleeve ?? null,
          purchasePrice: values.purchasePrice ?? null,
          purchaseDate: values.purchaseDate ?? null,
          notes: values.notes ?? null,
        },
        genreIds,
        tagIds,
      });
    } catch (error) {
      if (isConflictError(error)) return conflict(error);
      throw error;
    }

    return NextResponse.json(record, { status: 201 });
  },
);
