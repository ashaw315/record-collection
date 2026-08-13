import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, invalidJson, isUuid, notFound, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { moneySchema } from '@/lib/api/money';
import { appendPrice } from '@/lib/db/queries/prices';
import { findRecordById } from '@/lib/db/queries/records';

/**
 * SPEC.md §5.2 `POST /api/records/:id/prices` — "Append a price observation.
 * **Append-only (§7.5)** — there is no update path, and a request shaped like
 * an edit is rejected rather than quietly appended as a new row."
 *
 * **The rejection is the point, not a side effect of strictness.** §7.5's
 * guarantee is only meaningful if a correction is a DELIBERATE new observation.
 * A client sending `{ id, price }` believes it is editing history; appending
 * would raise the row count — satisfying any test that checks only that — while
 * leaving the client's model of what happened wrong.
 *
 * `.strictObject` is what produces the 400, and it is load-bearing rather than
 * housekeeping: `id`, `recordedAt` and `priceId` are exactly the keys someone
 * reaches for when trying to correct a row.
 */
const priceSchema = z.strictObject({
  price: moneySchema('price'),
  /**
   * §4.2's enum as amended, restated at the boundary so an unknown value is a
   * 400 not a 500. NOT optional: §7.6's chain has no defined case for an
   * untyped price, which is why the column is NOT NULL.
   *
   * `best_dig` was migrated out in 0005 — it names a PRESSING, and modelling it
   * as a price is the §8 conflation written into the schema. `asking` replaces
   * it and is deliberately outside §7.6's value chain.
   */
  priceType: z.enum(['new', 'used', 'asking']),
  source: z.string().trim().min(1).max(200).nullish(),
});

export const POST = withErrorHandling(
  'POST /api/records/:id/prices',
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return badRequest('That is not a valid record id.', 'INVALID_ID');
    }

    if ((await findRecordById(id)) === undefined) {
      return notFound('That record does not exist.');
    }

    let raw: unknown;
    try {
      raw = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = priceSchema.safeParse(raw);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const row = await appendPrice({
      recordId: id,
      price: parsed.data.price,
      priceType: parsed.data.priceType,
      source: parsed.data.source ?? null,
    });

    return NextResponse.json(row, { status: 201 });
  },
);
