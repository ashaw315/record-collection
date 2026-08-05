import { z } from 'zod';
import { isValidFormedYear } from '@/lib/api/year';
import { MAX_NESTED_IDS } from '@/lib/db/queries/nested';

/**
 * The PATCH body for a record (SPEC.md §5.2).
 *
 * In its own module so a test can import and assert on the SCHEMA, not only on
 * the endpoint. The property that matters cannot be checked any other way:
 *
 *   absent  → leave the existing set alone
 *   []      → remove every link
 *
 * Verified against Zod before relying on it: `.optional()` preserves that
 * distinction, but `.optional().default([])` DESTROYS it — absent parses as []
 * and "leave alone" silently becomes "remove all". That is data loss hidden in
 * a schema modifier, and it would make every endpoint test asserting "leave
 * alone" pass while testing nothing. Do not add a default here.
 */

const CONDITION_GRADES = ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'] as const;
const uuid = z.string().uuid();

// `.optional()` and NOT `.default([])`. See above.
const nestedIds = z.array(uuid).max(MAX_NESTED_IDS).optional();

export const recordPatchSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(500).optional(),
    artistId: uuid.optional(),
    labelId: uuid.nullish(),
    formatId: uuid.nullish(),
    pressingId: uuid.nullish(),
    storeId: uuid.nullish(),
    releaseYear: z
      .number()
      .int()
      .refine((value) => isValidFormedYear(value), { error: () => 'releaseYear is out of range' })
      .nullish(),
    conditionMedia: z.enum(CONDITION_GRADES).nullish(),
    conditionSleeve: z.enum(CONDITION_GRADES).nullish(),
    purchasePrice: z
      .string()
      .regex(/^\d{1,8}(\.\d{1,2})?$/, 'purchasePrice must be a decimal amount')
      .nullish(),
    purchaseDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'purchaseDate must be YYYY-MM-DD')
      .nullish(),
    notes: z.string().trim().max(10_000).nullish(),
    genreIds: nestedIds,
    tagIds: nestedIds,
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });

export type RecordPatch = z.infer<typeof recordPatchSchema>;
