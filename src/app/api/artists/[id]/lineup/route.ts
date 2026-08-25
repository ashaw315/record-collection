import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, duplicate, invalidJson, notFound, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import {
  findArtistById,
  findArtistByMusicbrainzId,
  updateArtist,
} from '@/lib/db/queries/artists';
import { MusicBrainzError } from '@/lib/musicbrainz/client';
import { pickDisambiguated, searchArtistsByName } from '@/lib/musicbrainz/search-artist';
import { walkLineup } from '@/lib/musicbrainz/walk-lineup';

/**
 * **The marginal one, stated rather than discovered.**
 *
 * §12 step 11 paces MusicBrainz at one request per second as a term of use, and
 * a band like Discharge is ~32 sequential requests — so roughly 32 seconds of
 * the 60 are spent waiting on the rate limiter before any database work counts.
 * A larger lineup exceeds the ceiling and the platform kills the function.
 *
 * **What that costs is small, and deliberately so.** `walkLineup` commits each
 * membership as it resolves and `saveMemberships` is idempotent (§4.3), so a
 * kill keeps every row already resolved and a re-walk resumes from there rather
 * than starting over. What is lost is the RESPONSE: the request dies with no
 * answer, so the UI shows a network error while the progress sits in the
 * database. Clicking again continues it.
 *
 * Degrading to slow-and-recoverable rather than to lost is why this is
 * acceptable at 60s instead of blocking on a larger limit the plan does not
 * offer.
 */
export const maxDuration = 60;

/**
 * SPEC.md §12 step 11 — `POST /api/artists/:id/lineup`.
 *
 * **Every artist in the real collection is hand-entered and has no MBID**, so
 * this searches MusicBrainz by NAME first — the one thing §4.3 says cannot
 * identify an artist. Hence two outcomes by design:
 *
 *   disambiguating search -> walk, and write the confirmed id
 *   anything else         -> return the candidates, walk nothing, write nothing
 *
 * **On demand only.** One walk is ~32 sequential requests at one per second, so
 * this is never a background job (§12 step 11).
 */
const bodySchema = z
  .object({
    /**
     * Set when the user has picked from the candidates a previous call
     * returned. §4.3: "a confirmed MBID is written; an inferred one is not" —
     * the distinction is who decided, not how confident the code is.
     */
    musicbrainzId: z.string().min(1).optional(),
  })
  .strict();

export const POST = withErrorHandling(
  'POST /api/artists/:id/lineup',
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return badRequest('That is not a valid artist id.', 'INVALID_ID');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    const artist = await findArtistById(id);
    if (artist === undefined) return notFound('Artist not found');

    /**
     * Confirming an MBID that another local row already holds.
     *
     * `artists.musicbrainz_id` is unique when present (§4.1), and this endpoint
     * wrote it with a bare `updateArtist` — so a collision surfaced as a raw
     * Postgres error that the `MusicBrainzError` catch below does not match,
     * and escaped as a 500 saying "Internal server error".
     *
     * **It is reachable through the app's own behaviour.** The walk's
     * `resolveArtist` creates rows carrying MBIDs for every band and member it
     * meets, so walking one artist can mint a row for some group, and a later
     * "Lineup" on a hand-entered row for that same group confirms an id the
     * walk already attached elsewhere. That is a duplicate the user can
     * resolve — the situation §4.3's match-candidate review exists for — so it
     * answers 409 naming the holder, per §5.4's rule that every DUPLICATE
     * carries `existingId`.
     *
     * Checked BEFORE writing rather than recovered after: the read is cheap,
     * and it keeps the refusal from depending on which of the two write sites
     * below was taken.
     */
    const claimMbid = async (mbid: string): Promise<NextResponse | null> => {
      const holder = await findArtistByMusicbrainzId(mbid);
      if (holder !== undefined && holder.id !== id) {
        return duplicate(
          `Another artist (${holder.name}) already carries that MusicBrainz id. ` +
            'If they are the same artist, merge them from the review below.',
          holder.id,
        );
      }

      await updateArtist(id, { musicbrainzId: mbid });
      return null;
    };

    try {
      /**
       * The id wins over the name whenever we have one — the user's choice
       * first, then a previously confirmed id. Searching again would spend a
       * request to re-answer a settled question, and could answer it
       * differently.
       */
      const known = parsed.data.musicbrainzId ?? artist.musicbrainzId;

      if (known === null || known === undefined) {
        const hits = await searchArtistsByName(artist.name);
        const chosen = pickDisambiguated(hits);

        if (chosen === null) {
          /**
           * Nothing is walked and nothing is written. An empty list is an
           * answer too — an artist MusicBrainz has never heard of — and saying
           * so beats pretending to have looked something up.
           */
          return NextResponse.json({ walked: false, candidates: hits });
        }

        const refused = await claimMbid(chosen.mbid);
        if (refused !== null) return refused;

        const result = await walkLineup(chosen.mbid);
        return NextResponse.json({ walked: true, candidates: [], ...result });
      }

      // A user-supplied id is a confirmation, so it is stored (§4.3).
      if (parsed.data.musicbrainzId !== undefined) {
        const refused = await claimMbid(parsed.data.musicbrainzId);
        if (refused !== null) return refused;
      }

      const result = await walkLineup(known);
      return NextResponse.json({ walked: true, candidates: [], ...result });
    } catch (error) {
      if (error instanceof MusicBrainzError) {
        return NextResponse.json(
          {
            error: {
              message: error.message,
              code: 'UPSTREAM_ERROR',
            },
          },
          { status: error.status ?? 502 },
        );
      }
      throw error;
    }
  },
);
