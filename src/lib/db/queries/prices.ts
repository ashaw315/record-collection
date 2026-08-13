import 'server-only';
import { desc, eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { priceHistory } from '@/db/schema';

/**
 * The `price_history` query layer (SPEC.md §4.2, §5.2, §7.5).
 *
 * **There is no update and no delete here, deliberately.** §7.5: "Price history
 * is append-only. Never `UPDATE` a `price_history` row; always insert a new
 * one." A query layer that offered an update would make the rule depend on
 * every caller remembering it; one that cannot express an update makes it
 * structural. (Rows still go when their parent record does — §4.2 cascades,
 * because append-only restricts UPDATE, not DELETE.)
 */

export type PriceRow = typeof priceHistory.$inferSelect;
export type PriceType = PriceRow['priceType'];

export async function appendPrice(input: {
  recordId: string;
  price: string;
  priceType: PriceType;
  source?: string | null;
}): Promise<PriceRow> {
  const db = getDb();

  const [row] = await db
    .insert(priceHistory)
    .values({
      recordId: input.recordId,
      price: input.price,
      priceType: input.priceType,
      source: input.source ?? null,
    })
    .returning();

  return row;
}

/** Every observation for a record, newest first — §10's sparkline reads this. */
export async function listPricesForRecord(recordId: string): Promise<PriceRow[]> {
  const db = getDb();

  return db
    .select()
    .from(priceHistory)
    .where(eq(priceHistory.recordId, recordId))
    .orderBy(desc(priceHistory.recordedAt), desc(priceHistory.id));
}
