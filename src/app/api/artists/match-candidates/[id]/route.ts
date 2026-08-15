import { NextResponse } from 'next/server';
import { z } from 'zod';
import { badRequest, invalidJson, notFound, validationError } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import {
  candidatePair,
  resolveMatchCandidate,
  type MatchResolution,
} from '@/lib/db/queries/artist-match-candidates';
import { MergeRefused, mergeArtists } from '@/lib/db/queries/merge-artists';

/**
 * SPEC.md §4.3 — answering one possible-duplicate pair.
 *
 * **Both answers cost exactly one call, deliberately.** A wrong merge is
 * invisible and self-reinforcing; a wrong "distinct" is visible and cheap. If
 * declining were the harder path the review would become a merge button with
 * extra steps, which is the dangerous failure arrived at through the UI.
 */
const bodySchema = z
  .object({
    // §4.3 names two and only two. An enum rather than a string: an unknown
    // value would be stored and the pair would read as answered without anyone
    // knowing what the answer was.
    resolution: z.enum(['merged', 'distinct']),
  })
  .strict();

export const PATCH = withErrorHandling(
  'PATCH /api/artists/match-candidates/:id',
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    if (!z.string().uuid().safeParse(id).success) {
      return badRequest('That is not a valid match candidate id.', 'INVALID_ID');
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return invalidJson();
    }

    const parsed = bodySchema.safeParse(body);
    if (!parsed.success) return validationError(parsed.error);

    /**
     * **"Same artist" MERGES; it does not merely record an opinion.**
     *
     * A review that cleared while the data stayed split would be worse than one
     * offering less — the user believes it is handled. `distinct` is a recorded
     * judgement that can be revisited; `merged` destroys a row.
     */
    if (parsed.data.resolution === 'merged') {
      const pair = await candidatePair(id);
      if (pair === undefined) return notFound('That match candidate no longer exists.');

      try {
        await mergeArtists({ survivorId: pair.survivorId, loserId: pair.loserId });
      } catch (error) {
        /**
         * **Only a RULE becomes a 409.** §4.3's two-MBID refusal is a sentence
         * the user should read, so it reaches them as a refusal rather than a
         * 500. Anything else is a fault and must NOT be dressed up as one:
         * catching everything here previously put
         * `Failed query: INSERT INTO artist_memberships ...` in front of the
         * user, styled as a considered answer, while telling the caller with a
         * 409 that nothing was wrong with the server.
         *
         * Rethrowing lets `withErrorHandling` log it and answer 500 with no
         * internals in the body (§5).
         */
        if (!(error instanceof MergeRefused)) throw error;

        return NextResponse.json(
          { error: { message: error.message, code: 'MERGE_REFUSED' } },
          { status: 409 },
        );
      }

      // The merge deletes the candidate rows with the losing artist, so there
      // is nothing left to resolve.
      return NextResponse.json({ ok: true, merged: true });
    }

    await resolveMatchCandidate(id, parsed.data.resolution as MatchResolution);

    return NextResponse.json({ ok: true });
  },
);
