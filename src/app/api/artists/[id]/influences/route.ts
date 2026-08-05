import { NextResponse } from 'next/server';
import { badRequest, isUuid, notFound } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { findArtistById } from '@/lib/db/queries/artists';
import { listInfluencesFor } from '@/lib/db/queries/influences';

/**
 * SPEC.md §5.5: `{ influencedBy: [...], influenced: [...] }`.
 *
 * Not the §5 list envelope, and deliberately not paginated: an artist's
 * influence edges are a small, complete set that the /manage editor and §8's
 * graph both consume whole. A page boundary would silently hide edges from the
 * graph.
 */

type Context = { params: Promise<{ id: string }> };

export const GET = withErrorHandling(
  'api.artists.[id].influences.GET',
  async (_request: Request, context: Context) => {
    const { id } = await context.params;
    if (!isUuid(id)) return badRequest('Invalid artist id', 'INVALID_ID');

    // 404 on the artist rather than empty lists: "this artist has no
    // influences" and "this artist does not exist" are different answers.
    if ((await findArtistById(id)) === undefined) return notFound('Artist not found');

    return NextResponse.json(await listInfluencesFor(id));
  },
);
