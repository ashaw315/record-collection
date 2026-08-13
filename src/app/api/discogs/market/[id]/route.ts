import { NextResponse } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { toDiscogsId } from '@/lib/discogs/fields';
import { normalizeMarket } from '@/lib/discogs/normalize-market';

/**
 * SPEC.md §10a layers 1 and 2 — `GET /api/discogs/market/:id`.
 *
 * **On demand, per release.** A search returns fifty results and search
 * payloads carry no price data at all, so rendering this across a page would
 * cost up to a hundred calls of a sixty-per-minute budget on a search the user
 * may not act on. §10a was amended to state the arithmetic after it was
 * measured.
 *
 * **The two layers are INDEPENDENT and fetched separately.** §10a: "later
 * layers degrade to absence, never to a guess." Layer 2 requires completed
 * Discogs seller settings and 404s without them — which is a normal state, not
 * an error, and the response says the range is unavailable rather than
 * inventing one from the floor.
 */
export const GET = withErrorHandling(
  'GET /api/discogs/market/:id',
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    /**
     * `toDiscogsId`, not `z.coerce.number()`. The coercion reads '0x50' as 80
     * and '5e4' as 50000 — verified — and this id is interpolated into a URL we
     * then request, so an accepted-but-transformed value fetches a DIFFERENT
     * release and presents its prices as the answer.
     */
    const releaseId = toDiscogsId(id);
    if (releaseId === null) {
      return badRequest('That is not a valid Discogs release id.', 'INVALID_ID');
    }

    const client = getDiscogsClient();

    /**
     * Settled independently. One layer failing must not erase the other — a
     * transient stats outage would otherwise discard a ladder that arrived
     * perfectly well.
     *
     * `curr_abbr=USD` on layer 1 is load-bearing, not cosmetic: measured
     * 2026-08-12, `marketplace/stats` honours the parameter while
     * `price_suggestions` ignores it and returns USD regardless of the
     * account's own currency. Asking for USD is the only way the floor and the
     * ladder are in one currency, and converting between them would invent a
     * number nobody quoted.
     */
    const [stats, suggestions] = await Promise.allSettled([
      client.get<Record<string, unknown>>(`/marketplace/stats/${releaseId}?curr_abbr=USD`),
      client.get<Record<string, unknown>>(`/marketplace/price_suggestions/${releaseId}`),
    ]);

    // Both gone means the app genuinely knows nothing — that is Discogs being
    // unreachable, and it is reported as such rather than as an empty answer.
    if (stats.status === 'rejected' && suggestions.status === 'rejected') {
      const cause = stats.reason;
      if (cause instanceof DiscogsError) return discogsErrorResponse(cause);
      throw cause;
    }

    const market = normalizeMarket({
      stats: stats.status === 'fulfilled' ? stats.value : null,
      suggestions: suggestions.status === 'fulfilled' ? suggestions.value : null,
    });

    return NextResponse.json({
      ...market,
      /**
       * Stated, so the UI can SAY the range is unavailable rather than render
       * an absence the reader has to interpret. An empty ladder with no
       * explanation looks like a record nobody has priced.
       */
      rangeUnavailable: market.conditions.length === 0,
    });
  },
);
