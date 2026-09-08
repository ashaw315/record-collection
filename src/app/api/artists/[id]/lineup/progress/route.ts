import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { membershipsForArtist } from '@/lib/db/queries/artist-memberships';

/**
 * How far a lineup walk has got (SPEC.md §12 step 11).
 *
 * **Derived from the rows the walk is already writing, not from a progress
 * table.** The walk commits each membership as it resolves it, so counting them
 * IS the progress — no new storage, and nothing left stale if the walk dies.
 *
 * A walk is ~32 sequential requests at one per second, and thirty-two seconds of
 * spinner is indistinguishable from a hang. The client polls this to say
 * "checked 12 of 31 members" instead.
 */
export const GET = withErrorHandling(
  'GET /api/artists/:id/lineup/progress',
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return badRequest('That is not a valid artist id.', 'INVALID_ID');
    }

    const memberships = await membershipsForArtist(id);

    /*
     * **A54: distinct PEOPLE, not rows.** §4.3 keys a membership on
     * (person, group, instrument) and MusicBrainz records one relation per
     * instrument per stint, so a row count is never a member count. This is the
     * number Adam watched climb to 32 for a band with seven members, and it
     * disagreed with the completion text for the same walk.
     */
    const people = new Set(memberships.map((membership) => membership.personArtistId));

    return NextResponse.json({ found: people.size });
  },
);
