import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, invalidJson, notFound, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { findArtistById, updateArtist } from '@/lib/db/queries/artists';
import { MusicBrainzError } from '@/lib/musicbrainz/client';
import { pickDisambiguated, searchArtistsByName } from '@/lib/musicbrainz/search-artist';
import { walkLineup } from '@/lib/musicbrainz/walk-lineup';

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

        await updateArtist(id, { musicbrainzId: chosen.mbid });
        const result = await walkLineup(chosen.mbid);
        return NextResponse.json({ walked: true, candidates: [], ...result });
      }

      // A user-supplied id is a confirmation, so it is stored (§4.3).
      if (parsed.data.musicbrainzId !== undefined) {
        await updateArtist(id, { musicbrainzId: parsed.data.musicbrainzId });
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
