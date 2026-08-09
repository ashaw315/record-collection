import { NextResponse } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { readCachedRelease, writeCachedRelease } from '@/lib/discogs/cache';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { toDiscogsId } from '@/lib/discogs/fields';
import { normalizeRelease } from '@/lib/discogs/normalize-release';

/**
 * SPEC.md §5.7 `GET /api/discogs/release/:id` — full detail, normalized and
 * ready to prefill the form.
 *
 * **The highest-stakes endpoint in this step**, because §5.7's two-stage import
 * runs through it: this payload becomes form fields the user is invited to
 * save. A blank field prompts a question; a confidently wrong one gets
 * accepted, so the normalizer is conservative wherever Discogs is ambiguous.
 *
 * Cached per §6 (7 days), unlike search and version listings. A release
 * describes a physical object and changes only when a contributor edits it —
 * and the version table invites opening several releases in a row, which is
 * precisely the burst the 60/minute budget cannot absorb without a cache.
 *
 * The RAW payload is cached, not the normalized one. Normalization is our code
 * and it keeps changing; caching its output would freeze today's mapping for
 * seven days, so a fix would not reach a record anyone had already looked at.
 */

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.discogs.release.GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;

    // Validated as digits BEFORE conversion: coercion alone accepts '0x50' as
    // 80 and would fetch a different release entirely. See `toDiscogsId`.
    const releaseId = toDiscogsId(id);
    if (releaseId === null) return badRequest('Invalid Discogs release id', 'INVALID_ID');

    const cached = await readCachedRelease(releaseId);
    if (cached !== null) {
      return NextResponse.json(normalizeRelease(cached.payload));
    }

    try {
      const payload = await getDiscogsClient().get(`/releases/${releaseId}`);

      // Written only on success — caching a failure would make it sticky for
      // seven days and serve an error for a release that exists.
      await writeCachedRelease(releaseId, payload);

      return NextResponse.json(normalizeRelease(payload));
    } catch (error) {
      if (error instanceof DiscogsError) return discogsErrorResponse(error);
      throw error;
    }
  },
);
