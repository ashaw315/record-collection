import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { journalEntries } from '@/db/schema';

/**
 * The `journal_entries` query layer (SPEC.md §4.2, §5.2).
 *
 * Separate from `records.ts` because CLAUDE.md §6 keeps database access out of
 * route handlers, and the record's hydrated read already selects entries
 * through its own query — these are the write paths that query does not cover.
 */

export type JournalEntry = typeof journalEntries.$inferSelect;

export async function createJournalEntry(input: {
  recordId: string;
  entryDate?: string | null;
  note: string;
}): Promise<JournalEntry> {
  const db = getDb();

  const [row] = await db
    .insert(journalEntries)
    .values({
      recordId: input.recordId,
      note: input.note,
      /**
       * Omitted rather than passed as null when absent, so the column's
       * `DEFAULT CURRENT_DATE` (§4.2) applies. Passing null would violate the
       * NOT NULL constraint — the default only fires for an absent column.
       */
      ...(input.entryDate === undefined || input.entryDate === null
        ? {}
        : { entryDate: input.entryDate }),
    })
    .returning();

  return row;
}

export async function findJournalEntryById(id: string): Promise<JournalEntry | undefined> {
  const db = getDb();

  const [row] = await db
    .select()
    .from(journalEntries)
    .where(eq(journalEntries.id, id))
    .limit(1);

  return row;
}

export async function deleteJournalEntry(id: string): Promise<void> {
  const db = getDb();

  await db.delete(journalEntries).where(eq(journalEntries.id, id));
}
