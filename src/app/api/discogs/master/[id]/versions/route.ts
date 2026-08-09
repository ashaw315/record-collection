import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { toDiscogsId } from '@/lib/discogs/fields';
import { normalizeVersionsResponse } from '@/lib/discogs/normalize-versions';
import { toOwnershipPayload } from '@/lib/discogs/ownership-payload';
import { matchOwnershipForResults } from '@/lib/db/queries/ownership';

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
      const client = getDiscogsClient();

      /**
       * The master is fetched ALONGSIDE the versions, for the artist name.
       *
       * Version rows carry a title and no artist — verified against the
       * captured payload. Tier 1 matches on `discogs_release_id` alone and so
       * works without it, but §7.7's tiers 2 and 3 match on artist AND title,
       * so without the artist every row the user does not own EXACTLY would
       * fall to "no badge".
       *
       * That is the specific failure §7.7 exists to prevent, on the specific
       * screen where it costs money: a table of pressings with "you own a
       * different pressing" silently missing from every row. It costs a second
       * rate-limited call per drill-down, issued concurrently, and that is the
       * cheaper mistake to make.
       */
      const [payload, master] = await Promise.all([
        client.get(`/masters/${masterId}/versions`, {
          page: query.data.page,
          // Matches the captured fixture's page size, and keeps a single page
          // readable — §10's table is compared by eye, not scrolled past.
          per_page: 25,
        }),
        client
          .get<{ artists?: Array<{ name?: string }> }>(`/masters/${masterId}`)
          // A failed master lookup degrades the badge to tier 1 only; it must
          // not fail the table the user actually asked for.
          .catch(() => undefined),
      ]);

      const artist = master?.artists?.[0]?.name ?? null;
      const normalized = normalizeVersionsResponse(payload);

      const ownership = await matchOwnershipForResults(
        normalized.data.map((version) => ({
          discogsId: version.discogsId,
          artist,
          title: version.title,
        })),
      );

      return NextResponse.json({
        ...normalized,
        data: normalized.data.map((version) => ({
          ...version,
          ownership: toOwnershipPayload(
            ownership.get(version.discogsId) ?? {
              tier: 'none',
              recordId: null,
              ownedPressing: null,
              wantList: null,
            },
          ),
        })),
      });
    } catch (error) {
      if (error instanceof DiscogsError) return discogsErrorResponse(error);
      throw error;
    }
  },
);
