import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withErrorHandling } from '@/lib/api/handler';
import { validationError } from '@/lib/api/errors';
import { buildGraph } from '@/lib/db/queries/graph';

/**
 * SPEC.md §5.6 `GET /api/graph` — the §8.1 network, owned records only.
 *
 * `strictObject`, so an unknown key is a 400 rather than being accepted and
 * ignored. `include=owned|wanted|both` was deleted from §5.6 when the graph was
 * scoped to owned records; a caller still sending it must be told it no longer
 * does anything, because silently ignoring it would let them believe the
 * response was scoped to the want list when it was not.
 */
const querySchema = z.strictObject({
  genreId: z.string().uuid().optional(),
});

export const GET = withErrorHandling('api.graph.GET', async (request: Request) => {
  const searchParams = new URL(request.url).searchParams;

  const raw: Record<string, string> = {};
  for (const [key, value] of searchParams.entries()) {
    raw[key] = value;
  }

  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) return validationError(parsed.error);

  /**
   * A `genreId` matching no genre yields an empty graph, NOT a 404: it is a
   * filter, not a path identifier, and `/api/records?genreId=` behaves the same
   * way. One endpoint 404ing while the other returns empty would read as a bug
   * from the client side.
   */
  return NextResponse.json(await buildGraph({ genreId: parsed.data.genreId }));
});
