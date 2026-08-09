import { z } from 'zod';
import { dateSchema } from '@/lib/api/date';
import { yearSchema } from '@/lib/api/year';
import { MAX_NESTED_IDS } from '@/lib/db/queries/nested';
import { CONDITION_GRADES } from './fields';

/**
 * The record-create body (SPEC.md §5.2), parsed by BOTH `POST /api/records`
 * and `POST /api/want-list/:id/acquire`.
 *
 * §5.3 requires "one shared schema definition, not two that agree today". The
 * emphasis is earned: this module's header used to claim the sharing while the
 * records route still had its own copy. The copies matched field for field, so
 * no test failed, no reviewer saw a difference, and the claim went unchecked
 * for a whole step. `create-schema.test.ts` now asserts the two endpoints hold
 * the SAME OBJECT, which is the only version of this that cannot rot.
 *
 * This module is imported by route handlers only, never by a client component,
 * so importing the `server-only` query layer for MAX_NESTED_IDS is safe — the
 * records route and `[id]/schema.ts` already do exactly that. If a client ever
 * needs part of this shape, follow `./fields`: move the definition to a
 * boundary-free module and re-export, rather than copying it.
 */

const uuid = z.string().uuid();
const conditionSchema = z.enum(CONDITION_GRADES).nullish();

/**
 * The query layer's constant, imported rather than copied.
 *
 * This was a hand-written `200` under a comment reading "Matches
 * MAX_NESTED_IDS" — a claim that would survive the real constant changing,
 * leaving the schema to accept arrays the transaction then rejects.
 */
const MAX_NESTED = MAX_NESTED_IDS;

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
  purchaseDate: dateSchema('Purchase date'),
  notes: z.string().trim().max(10_000).nullish(),
  genreIds: z.array(uuid).max(MAX_NESTED).optional(),
  tagIds: z.array(uuid).max(MAX_NESTED).optional(),
});

export type RecordCreateBody = z.infer<typeof recordCreateSchema>;
