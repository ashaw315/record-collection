import { z } from 'zod';
import { yearSchema } from '@/lib/api/year';
import { CONDITION_GRADES } from './fields';

/**
 * The record-create body (SPEC.md §5.2), shared by `POST /api/records` and
 * `POST /api/want-list/:id/acquire`.
 *
 * §5.3 says acquire takes "the full record payload", so the two must accept
 * exactly the same shape. Defining it twice is how they drift — and the drift
 * would be silent, with acquire quietly rejecting a field the create endpoint
 * accepts. Five copies of the year bound was the same lesson an hour earlier.
 *
 * `MAX_NESTED_IDS` is inlined rather than imported from the query layer, which
 * is `server-only`: this module is imported by route handlers, and pulling a
 * server-only module through it would be a needless coupling.
 */

const uuid = z.string().uuid();
const conditionSchema = z.enum(CONDITION_GRADES).nullish();

/** Matches MAX_NESTED_IDS in @/lib/db/queries/nested. */
const MAX_NESTED = 200;

export const recordCreateSchema = z.strictObject({
  title: z.string().trim().min(1).max(500),
  artistId: uuid,
  labelId: uuid.nullish(),
  formatId: uuid.nullish(),
  pressingId: uuid.nullish(),
  storeId: uuid.nullish(),
  /**
   * The ORIGINAL release year, not the pressing year (§4.2) — a 1982 album on
   * a 2011 reissue has releaseYear 1982 and the pressing carries 2011.
   */
  releaseYear: yearSchema('Release year'),
  conditionMedia: conditionSchema,
  conditionSleeve: conditionSchema,
  // NUMERIC(10,2) as a string: a float would silently lose pence.
  purchasePrice: z
    .string()
    .regex(/^\d{1,8}(\.\d{1,2})?$/, 'purchasePrice must be a decimal amount')
    .nullish(),
  purchaseDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'purchaseDate must be YYYY-MM-DD')
    .nullish(),
  notes: z.string().trim().max(10_000).nullish(),
  genreIds: z.array(uuid).max(MAX_NESTED).optional(),
  tagIds: z.array(uuid).max(MAX_NESTED).optional(),
});

export type RecordCreateBody = z.infer<typeof recordCreateSchema>;
