import { NextResponse } from 'next/server';
import { badRequest } from '@/lib/api/errors';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { discogsErrorResponse } from '@/lib/discogs/errors';
import { toDiscogsId } from '@/lib/discogs/fields';
import { summariseSpread, type VersionPrice } from '@/lib/discogs/version-spread';

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
  async (_request: Request, context: { params: Promise<{ id: string }> }) => {
    const { id } = await context.params;

    // `toDiscogsId`, not coercion: '0x50' reads as 80 and would price a
    // different master's versions while presenting them as this one's.
    const masterId = toDiscogsId(id);
    if (masterId === null) {
      return badRequest('That is not a valid Discogs master id.', 'INVALID_ID');
    }

    const client = getDiscogsClient();

    let versions: Array<{ id?: number }>;
    try {
      const payload = await client.get<{ versions?: Array<{ id?: number }> }>(
        `/masters/${masterId}/versions?per_page=100&page=1`,
      );
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

    const total = versions.length;
    const priceable = versions.slice(0, MAX_VERSIONS_PRICED);
    const checked: VersionPrice[] = [];

    for (const version of priceable) {
      const versionId = version.id;
      if (versionId === undefined) continue;

      try {
        const stats = await client.get<{ lowest_price?: { value?: number } | null }>(
          `/marketplace/stats/${versionId}?curr_abbr=USD`,
        );

        checked.push({
          discogsId: versionId,
          lowestPrice: typeof stats.lowest_price?.value === 'number' ? stats.lowest_price.value : null,
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

    return NextResponse.json({
      ...summary,
      checked: checked.length,
      total,
    });
  },
);
