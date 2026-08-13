import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, invalidJson, isUuid, notFound, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { boundedDateSchema } from '@/lib/api/date';
import { createJournalEntry } from '@/lib/db/queries/journal';
import { findRecordById } from '@/lib/db/queries/records';

/**
 * SPEC.md §5.2 `POST /api/records/:id/journal` — "Create a journal entry. Body
 * `{ entryDate?, note }`; `entryDate` defaults to today."
 *
 * §10 requires the record detail screen to carry "journal entries with
 * add-entry form". The hydrated read has returned entries since step 5 and
 * nothing could write one.
 */
const journalSchema = z
  .strictObject({
    /**
     * `boundedDateSchema`, not a bare string and not merely a calendar check.
     *
     * `2026-13-45` passes a regex and is not a day — that shape reached the
     * purchase-date field once already (NOTES). But `1823-04-11` IS a day, and
     * in a journal entry it is a typo: the bound is 1877 (sound recording
     * began) to today. You cannot have written a note about playing a record
     * tomorrow.
     */
    entryDate: boundedDateSchema('Entry date').optional(),
    // `.trim()` before `.min(1)`: §4.2 has `note TEXT NOT NULL`, and the column
    // would accept '   ' happily — an entry that says nothing.
    note: z.string().trim().min(1, 'note is required').max(10_000),
  })
  .strict();

export const POST = withErrorHandling(
  'POST /api/records/:id/journal',
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

    const parsed = journalSchema.safeParse(raw);
    if (!parsed.success) {
      return validationError(parsed.error);
    }

    const entry = await createJournalEntry({
      recordId: id,
      entryDate: parsed.data.entryDate,
      note: parsed.data.note,
    });

    return NextResponse.json(entry, { status: 201 });
  },
);
