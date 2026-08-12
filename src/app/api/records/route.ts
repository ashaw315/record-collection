import { NextResponse } from 'next/server';
import { z } from 'zod';
import { invalidJson, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { isValidFormedYear } from '@/lib/api/year';
import { parseListParams } from '@/lib/api/query-params';
import { writeRecordWithNested } from '@/lib/db/queries/nested';
import {
  RECORD_SORT_FIELDS,
  listRecords,
  missingIds,
  type RecordFilters,
} from '@/lib/db/queries/records';
import { findArtistById } from '@/lib/db/queries/artists';
import { findLabelById } from '@/lib/db/queries/labels';
import { findFormatById } from '@/lib/db/queries/formats';
import { findStoreById } from '@/lib/db/queries/stores';
import { findPressingById } from '@/lib/db/queries/pressings';
import { CONDITION_GRADES } from '@/lib/records/fields';

/**
 * SPEC.md §5.2 `POST /api/records`.
 *
 * Deliberately NO duplicate check. §4: duplicate records are legal and
 * expected — a collector may own two copies of the same album in different
 * pressings or conditions — so the reference template's find-then-409 shape
 * would reject valid data here.
 */

/**
 * The create body is defined ONCE, in `@/lib/records/create-schema`, and
 * `POST /api/want-list/:id/acquire` parses against this same object (§5.3).
 *
 * Re-exported rather than merely imported so the shared module's test can
 * assert the two endpoints hold the identical object. This route previously
 * kept its own copy while that module's header claimed the sharing had already
 * happened — the copies agreed field for field, so nothing failed and nobody
 * looked again.
 */
export { recordCreateSchema as createSchema } from '@/lib/records/create-schema';
import { recordCreateSchema as createSchema } from '@/lib/records/create-schema';
import { attachDiscogsCover, type CoverOutcome } from '@/lib/discogs/attach-cover';
import { getDiscogsClient } from '@/lib/discogs/client';
import { loadRelease } from '@/app/records/discogs-prefill';

// Used by the LIST filter schema below, which is this endpoint's own concern
// and shares nothing with the create body.
const uuid = z.string().uuid();

function fieldErrorResponse(fieldErrors: Record<string, string>) {
  return NextResponse.json(
    { error: { message: 'Invalid request', code: 'VALIDATION_ERROR', fieldErrors } },
    { status: 400 },
  );
}

/**
 * Query-parameter validation for the list endpoint.
 *
 * Every filter is parsed and REJECTED when malformed rather than ignored:
 * silently dropping an unrecognised filter returns more rows than the caller
 * asked for, which reads as success.
 */
/**
 * A year FILTER bound, held to the same range POST applies to `releaseYear`:
 * a filter cannot usefully ask for a year the column could never hold.
 *
 * `z.coerce.number()` alone was two defects at once. It turns '' into 0, so
 * `yearFrom=` silently applied `release_year >= 0` and dropped every undated
 * record, while `yearTo=` applied `<= 0` and emptied the collection — both
 * behind a 200. And with no upper bound, an out-of-int4-range value reached
 * Postgres and raised, turning a client error into a 500.
 *
 * The empty string is rejected BEFORE coercion, because coercion is what
 * destroys the distinction between "absent" and "blank". Every other filter
 * already rejects a blank value; these two were the outliers.
 */
const yearFilter = z
  .string()
  // Rejects '' as well as 'abc' and '1982.5' — verified that the empty string
  // fails HERE rather than at a length check, so no separate .min(1) is needed.
  // Order matters: this must run BEFORE the transform, because Number('') is 0
  // and coercing first is what destroyed the absent/blank distinction.
  .refine((value) => /^-?\d+$/.test(value), 'must be a whole number')
  .transform(Number)
  .refine((value) => isValidFormedYear(value), 'is out of range')
  .optional();

const filterSchema = z.strictObject({
  artistId: uuid.optional(),
  genreId: uuid.optional(),
  labelId: uuid.optional(),
  storeId: uuid.optional(),
  tagId: uuid.optional(),
  formatId: uuid.optional(),
  condition: z.enum(CONDITION_GRADES).optional(),
  yearFrom: yearFilter,
  yearTo: yearFilter,
  /**
   * §5.2, default true. Enumerated rather than coerced: z.coerce.boolean()
   * treats EVERY non-empty string as true, so 'false' would mean true — the
   * same class of silent coercion defect as the year filters.
   */
  includeUndated: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  q: z.string().trim().min(1).max(200).optional(),
});

export const GET = withErrorHandling('api.records.GET', async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;

  const params = parseListParams(searchParams, RECORD_SORT_FIELDS);
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

  // Only the filter keys, so page/pageSize/sort do not trip strictObject.
  const raw: Record<string, string> = {};
  for (const key of [
    'artistId', 'genreId', 'labelId', 'storeId', 'tagId', 'formatId',
    'condition', 'yearFrom', 'yearTo', 'includeUndated', 'q',
  ]) {
    const value = searchParams.get(key);
    if (value !== null) raw[key] = value;
  }

  const filters = filterSchema.safeParse(raw);
  if (!filters.success) return validationError(filters.error);

  const { page, pageSize, offset, sort } = params.value;
  const { rows, total, undatedCount } = await listRecords({
    limit: pageSize,
    offset,
    sort,
    filters: filters.data as RecordFilters,
  });

  return NextResponse.json({ data: rows, meta: { total, page, pageSize, undatedCount } });
});

export const POST = withErrorHandling('api.records.POST', async (request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return invalidJson();
  }

  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return validationError(parsed.error);

  const { genreIds = [], tagIds = [], ...values } = parsed.data;

  /**
   * Every foreign key is checked here so a bad id is a 400 naming its field
   * rather than a foreign-key violation shaped into a 500. Each check names
   * ITSELF — a client told only "invalid request" cannot tell which of six
   * relations was wrong.
   */
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

  if (Object.keys(fieldErrors).length > 0) return fieldErrorResponse(fieldErrors);

  /**
   * The nested write is transactional (unit 2): the record and its junction
   * rows land together or not at all. The pre-checks above make the common
   * failures a 400; the transaction is what guarantees no half-created record
   * survives a failure they did not anticipate.
   */
  const created = await writeRecordWithNested({
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

  /**
   * The Discogs cover, carried across on SAVE (§5.7, §5.9) — the QA finding
   * that "a Discogs import doesn't bring the cover across".
   *
   * Here rather than at form-open because `images.record_id` is NOT NULL: there
   * is no valid row before this point, and fetching earlier would leave an
   * orphaned blob every time a form was abandoned.
   *
   * Awaited rather than fired-and-forgotten: a serverless function may be
   * frozen the moment it responds, so a detached promise is not guaranteed to
   * finish. `attachDiscogsCover` never throws and reports its own failures, so
   * awaiting it cannot fail the record — verified by its own tests, including a
   * synchronously-throwing client.
   */
  const cover = await attachCoverFor(created.pressingId, created.id);

  return NextResponse.json({ ...created, cover }, { status: 201 });
});

/**
 * Resolves the release behind a saved record's pressing and attaches its cover.
 *
 * Returns a `CoverOutcome` the client can show — "the cover could not be
 * fetched" is worth saying, since the alternative is a record that silently
 * has no image and no explanation.
 */
async function attachCoverFor(
  pressingId: string | null,
  recordId: string,
): Promise<CoverOutcome> {
  if (pressingId === null) return { attached: false, reason: 'none' };

  const pressing = await findPressingById(pressingId);
  if (pressing?.discogsReleaseId == null) return { attached: false, reason: 'none' };

  try {
    const release = await loadRelease(pressing.discogsReleaseId);
    if (release === null) return { attached: false, reason: 'failed' };

    return await attachDiscogsCover({
      recordId,
      images: release.images,
      client: getDiscogsClient(),
    });
  } catch {
    // Reaching Discogs for the release detail can fail too, and it fails the
    // same way as everything else on this path: no cover, never no record.
    return { attached: false, reason: 'failed' };
  }
}
