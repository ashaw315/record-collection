import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { toDiscogsId } from '@/lib/discogs/fields';
import { normalizeVersionsResponse } from '@/lib/discogs/normalize-versions';

/**
 * SPEC.md §5.7 `GET /api/discogs/master/:id/versions`.
 *
 * **This is where a search becomes an identification.** A master says which
 * album; its versions say which PRESSING, and §5.7 calls this "the step where
 * the user identifies their pressing rather than just the album".
 *
 * Master 50683 is the case that shows why it cannot be skipped: releases 381756
 * and 6779382 share country, label and catalog number (`CLAY LP 3`), and differ
 * only by year and format descriptors. One is a 1982 Clay original, the other a
 * 1989 reissue. §10's comparison table carries all five fields together for
 * exactly this reason, and CLAUDE.md §8 calls collapsing the two the worst bug
 * this app can ship.
 *
 * Not cached. §6 caches release DETAIL; a version list gains rows as
 * contributors add pressings, and a stale one hides the pressing being hunted.
 */

type Context = { params: Promise<{ id: string }> };

const querySchema = z.strictObject({
  page: z.coerce.number().int().positive().optional(),
});

export const GET = withErrorHandling(
  'api.discogs.master.versions.GET',
  async (request: Request, context: Context) => {
    const { id } = await context.params;

    // Digits before conversion — see `toDiscogsId` for the probed list of
    // values `z.coerce.number()` accepts and transforms.
    const masterId = toDiscogsId(id);
    if (masterId === null) return badRequest('Invalid Discogs master id', 'INVALID_ID');

    const url = new URL(request.url);
    const query = querySchema.safeParse(Object.fromEntries(url.searchParams.entries()));
    if (!query.success) return badRequest('Invalid page', 'INVALID_PAGE');

    try {
      const payload = await getDiscogsClient().get(`/masters/${masterId}/versions`, {
        page: query.data.page,
        // Matches the captured fixture's page size, and keeps a single page
        // readable — §10's table is compared by eye, not scrolled past.
        per_page: 25,
      });

      return NextResponse.json(normalizeVersionsResponse(payload));
    } catch (error) {
      if (error instanceof DiscogsError) return discogsErrorResponse(error);
      throw error;
    }
  },
);
