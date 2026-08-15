import { NextResponse } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { toDiscogsId } from '@/lib/discogs/fields';
import { normalizeMarket } from '@/lib/discogs/normalize-market';
import {
  cacheCovers,
  readCachedMarket,
  writeCachedMarket,
  type MarketLayer,
} from '@/lib/discogs/market-cache';

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

    /**
     * §10a: served from cache if `fetched_at` is under 7 days old. This is what
     * makes layer 3 affordable — the spread calls this data once per version,
     * eleven times for a single master, and without a cache every expand pays
     * that again.
     */
    const cached = await readCachedMarket(releaseId);
    // Both layers, or it cannot answer this request — see `cacheCovers`.
    if (cached !== null && cacheCovers(cached.payload, ['floor', 'ladder'])) {
      return NextResponse.json(cached.payload);
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

    /**
     * **Which layers this row can actually answer for — measured, not assumed.**
     *
     * This was a hardcoded `['floor', 'ladder']` literal, written on every
     * response that was not a total failure. So a transient 503 on
     * `price_suggestions` stored a row claiming a ladder it had never fetched,
     * `cacheCovers` answered `true`, and for seven days every reader was served
     * an empty `conditions` array as though it were the measured truth. One
     * blip cost a week of layer 2 on that release, and nothing retried because
     * the row looked complete.
     *
     * **A 404 counts as FETCHED, a rejection does not**, and the distinction is
     * the whole point. §10a documents the 404: `price_suggestions` returns it
     * when the token's account has no seller settings, which is Discogs
     * ANSWERING — this account cannot see a ladder for this release. That is a
     * settled fact worth caching. A 503 is Discogs failing to answer, and an
     * empty ladder then means "we do not know", which must expire on the next
     * request rather than in seven days.
     *
     * The two are indistinguishable in the payload — `conditions: []` either
     * way — which is precisely why the marker has to carry the difference.
     */
    const ladderAnswered =
      suggestions.status === 'fulfilled' ||
      (suggestions.reason instanceof DiscogsError && suggestions.reason.status === 404);

    const floorAnswered =
      stats.status === 'fulfilled' ||
      (stats.reason instanceof DiscogsError && stats.reason.status === 404);

    const layersFetched: MarketLayer[] = [
      ...(floorAnswered ? (['floor'] as const) : []),
      ...(ladderAnswered ? (['ladder'] as const) : []),
    ];

    const payload = {
      ...market,
      /**
       * Stated, so the UI can SAY the range is unavailable rather than render
       * an absence the reader has to interpret. An empty ladder with no
       * explanation looks like a record nobody has priced.
       *
       * Deliberately still `conditions.length === 0` and NOT `!ladderAnswered`:
       * this answers the reader's question ("is there a range to show me?"),
       * which is false in both cases. `layersFetched` answers the cache's
       * question ("may I serve this again?"), and only there does the
       * fact-versus-unknown distinction change the behaviour.
       */
      rangeUnavailable: market.conditions.length === 0,
      layersFetched,
    };

    /**
     * Cached only past the both-rejected check above, so a Discogs outage is
     * never stored as an answer. Writing an empty result would serve "nothing
     * for sale" for seven days after a one-minute failure — absence recorded as
     * fact, which §10a prohibits.
     *
     * A partial answer IS cached: one layer succeeding is a real reading of the
     * market, and `rangeUnavailable` already says which part is missing.
     */
    await writeCachedMarket(releaseId, payload);

    return NextResponse.json(payload);
  },
);
