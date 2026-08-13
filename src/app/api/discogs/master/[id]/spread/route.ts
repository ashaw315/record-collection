import { NextResponse } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { toDiscogsId } from '@/lib/discogs/fields';
import { sameFormatFamily, summariseSpread, type VersionPrice } from '@/lib/discogs/version-spread';
import { cachedLowestPrice, readCachedMarket, writeCachedMarket } from '@/lib/discogs/market-cache';

/**
 * SPEC.md §10a layer 3 — `GET /api/discogs/master/:id/spread`.
 *
 * **The cost is the design.** One call per version: eleven for the Hot Tuna
 * master, a fifth of a 60/minute budget on a single expand. §10a: "fetched on
 * demand only — when the user opens a master's version table. Never eagerly,
 * never for a whole search page."
 *
 * Sequential rather than parallel, deliberately. `Promise.all` over eleven
 * versions reserves eleven tokens at once and every other request on the page
 * queues behind them; one at a time lets the limiter interleave, and lets this
 * STOP the moment the budget refuses rather than discovering it eleven times.
 */

/**
 * A ceiling on how many versions one expand will price.
 *
 * A master with sixty versions would otherwise spend the entire minute's budget
 * on a single table. The spread is a judgement about whether pressing matters,
 * and that judgement is not improved by the sixtieth data point — but the
 * answer says how many it checked either way, so a capped spread is honestly
 * partial rather than silently truncated.
 */
const MAX_VERSIONS_PRICED = 15;

export const GET = withErrorHandling(
  'GET /api/discogs/master/:id/spread',
  async (request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    /**
     * The medium the user is actually looking at, so the spread compares
     * pressings rather than formats (§10a).
     *
     * A free string rather than an enum: it is passed straight to
     * `sameFormatFamily`, which matches it against a known vocabulary and
     * treats anything unrecognised as "no filter" — so a junk value degrades to
     * today's behaviour instead of an empty spread.
     */
    const viewedFormat = new URL(request.url).searchParams.get('format');

    // `toDiscogsId`, not coercion: '0x50' reads as 80 and would price a
    // different master's versions while presenting them as this one's.
    const masterId = toDiscogsId(id);
    if (masterId === null) {
      return badRequest('That is not a valid Discogs master id.', 'INVALID_ID');
    }

    const client = getDiscogsClient();

    let versions: Array<{ id?: number; major_formats?: string[] }>;
    try {
      const payload = await client.get<{
        versions?: Array<{ id?: number; major_formats?: string[] }>;
      }>(`/masters/${masterId}/versions?per_page=100&page=1`);
      versions = payload.versions ?? [];
    } catch (cause) {
      /**
       * Distinct from a partial spread: without the version list there is
       * nothing to price at all, which is "we could not ask" rather than "we
       * asked about some of them".
       */
      if (cause instanceof DiscogsError) return discogsErrorResponse(cause);
      throw cause;
    }

    /**
     * **Filtered BEFORE the cap, which is the whole point.** Taking the first
     * fifteen and then discarding the non-vinyl ones would spend real calls on
     * versions that cannot appear in the answer — measured on the Carpenters
     * master, the first fifteen in Discogs order are 12 vinyl and 3 other, so a
     * fifth of the budget bought nothing. Filtering first buys fifteen
     * comparable versions for the same fifteen calls.
     *
     * `total` counts the FILTERED set: "3 of 64 vinyl pressings checked" is the
     * honest denominator, where "3 of 160" would describe a population the
     * spread never intended to measure.
     */
    const comparable =
      viewedFormat === null
        ? versions
        : versions.filter((version) => sameFormatFamily(version.major_formats ?? [], [viewedFormat]));

    const total = comparable.length;
    const priceable = comparable.slice(0, MAX_VERSIONS_PRICED);
    const checked: VersionPrice[] = [];

    for (const version of priceable) {
      const versionId = version.id;
      if (versionId === undefined) continue;

      /**
       * §10a: "versions already seen through search or a previous expand are
       * free the first time." A cached version costs nothing AND spends none of
       * the budget, so the calls saved here go to versions that still need
       * pricing rather than being given back.
       *
       * Shares the store the market endpoint writes, so the two layers warm
       * each other: opening a record's market panel prices that release for a
       * later spread, and vice versa.
       */
      const cached = await readCachedMarket(versionId);
      if (cached !== null) {
        checked.push({ discogsId: versionId, lowestPrice: cachedLowestPrice(cached.payload) });
        continue;
      }

      try {
        const stats = await client.get<{ lowest_price?: { value?: number } | null }>(
          `/marketplace/stats/${versionId}?curr_abbr=USD`,
        );

        const lowestPrice =
          typeof stats.lowest_price?.value === 'number' ? stats.lowest_price.value : null;

        checked.push({ discogsId: versionId, lowestPrice });

        /**
         * **Only the floor, because only the floor was fetched.** The spread
         * asks `marketplace/stats` and never `price_suggestions`, so writing a
         * full market payload here would record an empty condition ladder as a
         * cached fact — and the market panel would then serve "no ladder" for
         * seven days for a release nobody ever asked layer 2 about.
         *
         * `layersFetched` says which layers this row can answer for. A reader
         * needing layer 2 treats a floor-only row as a miss.
         */
        await writeCachedMarket(versionId, {
          layersFetched: ['floor'],
          lowestPrice: lowestPrice === null ? null : { value: lowestPrice, currency: 'USD' },
        });
      } catch (cause) {
        /**
         * **Stop, do not continue.** A limiter that has refused will refuse the
         * next one too, and hammering it spends the remaining budget on
         * failures while the user waits. What has been gathered is reported as
         * partial.
         *
         * Any Discogs error stops the loop, not only a 429: a release that
         * 404s individually is rare, and treating every failure the same way
         * keeps this from silently pricing ten versions while failing on one.
         */
        if (cause instanceof DiscogsError) break;
        throw cause;
      }
    }

    const summary = summariseSpread({ checked, total, currency: 'USD' });

    /**
     * The per-version figures, returned rather than discarded.
     *
     * QA: the verdict says "which pressing you get matters more than the price"
     * over a table with no prices in it — the user learns that the answer varies
     * and is given no way to act on it. These were already fetched to compute
     * the spread; the table joins them by release id.
     *
     * `null` is kept and distinguished from absent: a version nobody is selling
     * has no price, which is not the same as a version that was never checked.
     */
    const prices = Object.fromEntries(
      checked.map((version) => [String(version.discogsId), version.lowestPrice]),
    );

    return NextResponse.json({
      ...summary,
      prices,
      checked: checked.length,
      total,
    });
  },
);
