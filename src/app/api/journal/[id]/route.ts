import { NextResponse } from 'next/server';
import { badRequest, isUuid, notFound } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { deleteJournalEntry, findJournalEntryById } from '@/lib/db/queries/journal';

/**
 * SPEC.md §5.2 `DELETE /api/journal/:id`.
 *
 * Deleting an entry never touches the record. §4.2 cascades entries when a
 * RECORD goes; nothing cascades the other way, and a note about a record is
 * not a reason to lose the record.
 */
export const DELETE = withErrorHandling(
  'DELETE /api/journal/:id',
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!isUuid(id)) {
      return badRequest('That is not a valid journal entry id.', 'INVALID_ID');
    }

    if ((await findJournalEntryById(id)) === undefined) {
      return notFound('That journal entry does not exist.');
    }

    await deleteJournalEntry(id);

    return new NextResponse(null, { status: 204 });
  },
);
