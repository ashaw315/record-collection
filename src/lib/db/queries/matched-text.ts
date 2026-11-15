import 'server-only';
import { sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { recordMatchedText } from '@/db/schema';

/**
 * **SPEC §4.6: the only writer of a record's generated matched text.** It writes `generated`, `generated_model` and
 * `generated_at`, and nothing else, so an edit Adam has made outlives every regeneration. A blank is NULL with no model
 * or time, so "unknown" has one form and the record stays ineligible for the pick.
 */
export async function storeGeneratedMatchedText(recordId: string, text: string | null, model: string): Promise<void> {
  const generated = text === null || text.trim() === '' ? null : text.trim();
  const values = { recordId, generated, generatedModel: generated === null ? null : model, generatedAt: generated === null ? null : new Date() };
  await getDb()
    .insert(recordMatchedText)
    .values(values)
    .onConflictDoUpdate({
      target: recordMatchedText.recordId,
      set: { generated: sql`excluded.generated`, generatedModel: sql`excluded.generated_model`, generatedAt: sql`excluded.generated_at` },
    });
}
