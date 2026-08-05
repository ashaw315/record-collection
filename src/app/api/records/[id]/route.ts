import { NextResponse } from 'next/server';
import {
  badRequest,
  conflictInUse,
  invalidJson,
  isUuid,
  notFound,
  validationError,
} from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { replaceRecordGenres, replaceRecordTags } from '@/lib/db/queries/nested';
import {
  countRecordReferences,
  deleteRecord,
  findRecordById,
  hydrateRecord,
  missingIds,
  updateRecordFields,
} from '@/lib/db/queries/records';
import { findArtistById } from '@/lib/db/queries/artists';
import { findLabelById } from '@/lib/db/queries/labels';
import { findFormatById } from '@/lib/db/queries/formats';
import { findStoreById } from '@/lib/db/queries/stores';
import { findPressingById } from '@/lib/db/queries/pressings';
import { recordPatchSchema } from './schema';

/**
 * SPEC.md §5.2 `GET /api/records/:id` — the record with artist, label, format,
 * store, pressing, genres, tags, images, journal entries and latest price
 * resolved.
 */

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.records.[id].GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid record id', 'INVALID_ID');

    const record = await hydrateRecord(id);
    if (record === undefined) return notFound('Record not found');

    return NextResponse.json(record);
  },
);

export const PATCH = withErrorHandling(
  'api.records.[id].PATCH',
  async (request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid record id', 'INVALID_ID');

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = recordPatchSchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    if ((await findRecordById(id)) === undefined) return notFound('Record not found');

    const { genreIds, tagIds, ...scalars } = parsed.data;

    // Every relation named individually, as on POST.
    const fieldErrors: Record<string, string> = {};

    if (scalars.artistId !== undefined && (await findArtistById(scalars.artistId)) === undefined) {
      fieldErrors.artistId = 'No artist with that id exists';
    }
    if (scalars.labelId != null && (await findLabelById(scalars.labelId)) === undefined) {
      fieldErrors.labelId = 'No label with that id exists';
    }
    if (scalars.formatId != null && (await findFormatById(scalars.formatId)) === undefined) {
      fieldErrors.formatId = 'No format with that id exists';
    }
    if (scalars.storeId != null && (await findStoreById(scalars.storeId)) === undefined) {
      fieldErrors.storeId = 'No store with that id exists';
    }
    if (scalars.pressingId != null && (await findPressingById(scalars.pressingId)) === undefined) {
      fieldErrors.pressingId = 'No pressing with that id exists';
    }

    if (genreIds !== undefined) {
      const missing = await missingIds('genres', genreIds);
      if (missing.length > 0) fieldErrors.genreIds = `No genre with id ${missing[0]} exists`;
    }
    if (tagIds !== undefined) {
      const missing = await missingIds('tags', tagIds);
      if (missing.length > 0) fieldErrors.tagIds = `No tag with id ${missing[0]} exists`;
    }

    // Validated BEFORE anything is written, so a bad nested id leaves the
    // scalars untouched too — a partially-applied PATCH is the same silent
    // corruption as a partially-applied create.
    if (Object.keys(fieldErrors).length > 0) {
      return NextResponse.json(
        { error: { message: 'Invalid request', code: 'VALIDATION_ERROR', fieldErrors } },
        { status: 400 },
      );
    }

    await updateRecordFields(id, scalars);

    /**
     * `undefined` means LEAVE ALONE; `[]` means REMOVE ALL.
     *
     * The two are checked independently — a handler that reads them together
     * ("if either is present, replace both") passes any test varying them in
     * lockstep and silently wipes the other set in production.
     */
    if (genreIds !== undefined) await replaceRecordGenres(id, genreIds);
    if (tagIds !== undefined) await replaceRecordTags(id, tagIds);

    const updated = await hydrateRecord(id);
    if (updated === undefined) return notFound('Record not found');

    return NextResponse.json(updated);
  },
);

export const DELETE = withErrorHandling(
  'api.records.[id].DELETE',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid record id', 'INVALID_ID');

    if ((await findRecordById(id)) === undefined) return notFound('Record not found');

    /**
     * Only want_list.acquired_record_id blocks (§7.3: the want list doubles as
     * acquisition history). images, journal_entries, price_history and both
     * junctions CASCADE and are correctly absent from REFERRERS.
     */
    const referenceCount = await countRecordReferences(id);
    if (referenceCount > 0) {
      return conflictInUse('Record is in use and cannot be deleted', referenceCount);
    }

    const outcome = await deleteRecord(id);
    if (outcome.status === 'not-found') return notFound('Record not found');
    if (outcome.status === 'in-use') {
      return conflictInUse('Record is in use and cannot be deleted', outcome.referenceCount);
    }

    return NextResponse.json({ ok: true });
  },
);
