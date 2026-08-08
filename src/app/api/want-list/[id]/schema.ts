import { z } from 'zod';

/**
 * The PATCH body for a want-list item (SPEC.md §5.3).
 *
 * In its own module so a test can assert on the SCHEMA rather than only the
 * endpoint. The property that matters cannot be checked any other way:
 *
 *   absent  → leave the existing value alone
 *   null    → clear it
 *   []      → remove every genre link
 *
 * `.optional()` preserves that; `.default([])` DESTROYS it, turning "leave
 * alone" into "remove all". That is data loss hidden in a schema modifier, and
 * it is the first entry in NOTES' Zod coercion class. Do not add a default.
 */

const uuid = z.string().uuid();

export const wantListPatchSchema = z
  .strictObject({
    title: z.string().trim().min(1).max(500).optional(),
    artistId: uuid.optional(),
    labelId: uuid.nullish(),
    /**
     * §4.2: "1 = highest, 5 = lowest", with NO database CHECK — this boundary
     * is the only guard. See the NOTES entry on unenforced §4 ranges.
     */
    priority: z
      .number()
      .int()
      .min(1, 'Priority must be between 1 and 5')
      .max(5, 'Priority must be between 1 and 5')
      .optional(),
    targetPressingId: uuid.nullish(),
    // §7.2: about the PRESSING. Never a price, never derived from maxPrice.
    bestDigNotes: z.string().trim().max(10_000).nullish(),
    // The user's own ceiling. Unrelated to bestDigNotes (CLAUDE.md §8).
    maxPrice: z
      .string()
      .regex(/^\d{1,8}(\.\d{1,2})?$/, 'maxPrice must be a decimal amount')
      .nullish(),
    genreIds: z.array(uuid).max(200).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field must be supplied',
  });
