import { z } from 'zod';

/**
 * A decimal money amount as a STRING, matching `NUMERIC(10,2)` (SPEC.md §4.2).
 *
 * **A string, never a number.** These reach a `NUMERIC` column, and passing
 * through a JS float is how 24.50 becomes 24.499999999999996 — a money value
 * that no longer equals what was typed. The database stores exact decimals; the
 * boundary keeps them exact.
 *
 * **The regex IS the validation.** `z.coerce.number()` reads `'0x50'` as 80 and
 * `'5e4'` as 50000 — verified, and recorded in NOTES as the coercion class. A
 * coercion says yes to what resembles the type; a trust boundary must say no to
 * everything it was not promised.
 *
 * Extracted when `POST /api/records/:id/prices` needed it and would have been
 * the THIRD copy of the same pattern — `create-schema.ts` and the Discogs
 * import already carried it. Two definitions that agree today are how they
 * drift.
 */
export function moneySchema(label: string) {
  return z.string().regex(/^\d{1,8}(\.\d{1,2})?$/, `${label} must be a decimal amount`);
}
