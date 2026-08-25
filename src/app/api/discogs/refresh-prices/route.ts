import { NextResponse } from 'next/server';
import { withErrorHandling } from '@/lib/api/handler';
import { DiscogsError, getDiscogsClient } from '@/lib/discogs/client';
import { normalizeMarket } from '@/lib/discogs/normalize-market';
import { appendPrice } from '@/lib/db/queries/prices';
import { recordsToRefresh } from '@/lib/db/queries/refresh-prices';
import { describeError } from '@/lib/errors/describe';
import { logger } from '@/lib/logger';

/**
 * SPEC.md §5.7 — `POST /api/discogs/refresh-prices`. The weekly price refresh
 * (§6, §12 step 16).
 *
 * **Auth is middleware's, not this handler's.** §3: the cron endpoint stays
 * behind middleware and authenticates by a `CRON_SECRET` bearer token rather
 * than a session cookie, deliberately NOT exempted wholesale. The check is
 * caller-agnostic — a constant-time comparison against the header, with no
 * platform-specific signal — so an external scheduler is the same to it as any
 * other caller. That matters here because the schedule is a GitHub Actions
 * workflow rather than Vercel Cron (Hobby caps Vercel crons at once a day), so
 * the request arrives from outside the deployment entirely.
 *
 * **The floor only — layer 1.** §10a's layer 2 ladder needs a second call per
 * release, doubling the cost of a walk that is already the largest scheduled
 * spend of a 60/minute budget, and `price_history` stores one figure per row.
 * The floor is the number that answers "has this appreciated" on the record
 * detail screen, which is what §10a says this data is for there.
 *
 * **The cache is deliberately NOT read.** A weekly refresh exists to take a
 * fresh observation, and `market_cache`'s TTL is 7 days — so reading it would
 * hand this job its own last write and record week-old figures as a new
 * measurement. The result is written to the cache, since a fresh fetch is worth
 * serving to the screens that do read it.
 */
/**
 * **Hobby's ceiling, and this route can exceed it — say so rather than discover it.**
 *
 * §6 paces Discogs at 60 requests/minute and the client AWAITS the bucket, so a
 * full refresh takes roughly one second per record beyond the first sixty. A
 * collection of ~60 records is already at the limit; a larger one is killed
 * partway through.
 *
 * **What that costs is one week, not any data.** Each record's price is
 * committed as it is fetched (§7.5, append-only), so a kill keeps everything
 * written up to that point and the next run starts fresh rather than resuming a
 * cursor — the records it missed are simply priced seven days later. No row is
 * corrupt, nothing is half-written, and the failure needs no recovery.
 *
 * That is why this is stated rather than solved. The fix when it matters is
 * batching — a `?after=` cursor, or one workflow run per N records — and it
 * costs complexity that a collection of this size does not yet justify.
 * **Trigger: the collection passing ~60 records with a `discogs_release_id`**,
 * which is when a single run stops finishing.
 */
export const maxDuration = 60;

export const POST = withErrorHandling('POST /api/discogs/refresh-prices', async () => {
  const targets = await recordsToRefresh();
  const client = getDiscogsClient();

  let written = 0;
  let skipped = 0;
  let failed = 0;

  /**
   * **Sequential, and each record isolated in its own try.**
   *
   * Sequential because §6's limiter is 60/minute and the client awaits it: a
   * `Promise.all` over the collection would queue every request at once for no
   * gain, since the bucket paces them anyway.
   *
   * Isolated because a run that aborts on the first failure would leave every
   * record after it unpriced, every week, with nothing to say so. Append-only
   * (§7.5) means a partial run corrupts nothing — but that is a property of the
   * table and does not make the loop keep going. This does.
   */
  for (const target of targets) {
    try {
      const stats = await client.get<Record<string, unknown>>(
        `/marketplace/stats/${target.discogsReleaseId}?curr_abbr=USD`,
      );

      const market = normalizeMarket({ stats, suggestions: null });

      /**
       * **No price, no row — absence is not an observation.**
       *
       * §6 says to write rows from Discogs and does not say what absence means.
       * There is no honest row for it: `price_type` is `new | used | asking`
       * and every value asserts a price exists, so recording "no data" would
       * mean inventing a figure or a type, which §7.6's value chain then reads
       * as what the record is worth. §10a's own rule — "later layers degrade to
       * absence, never to a guess" — and the market cache already shipped the
       * opposite once.
       *
       * It is COUNTED, so the absence is reported rather than silent.
       */
      if (market.lowestPrice === null) {
        skipped += 1;
        continue;
      }

      await appendPrice({
        recordId: target.recordId,
        price: market.lowestPrice.value.toFixed(2),
        /**
         * §7.2: `asking` is "a price someone wants but nobody has paid" — a
         * marketplace floor exactly. Not `used`: §7.6's chain reads `used` then
         * `new` for estimated collection value and excludes `asking`
         * deliberately, so typing these rows wrongly would inflate the
         * collection's value with prices nobody paid.
         */
        priceType: 'asking',
        source: 'discogs',
      });

      written += 1;
    } catch (cause) {
      /**
       * **A 404 is an ANSWER; anything else is a failure to answer.**
       *
       * Discogs returning 404 means the release is gone — a settled fact about
       * that record, and nothing to retry. A 503, a timeout or a bug in our own
       * mapping is "we do not know", which must not be reported as "nothing to
       * price": that is absence recorded as fact, the thing §10a prohibits and
       * the shape the market cache was caught in.
       *
       * Caught broadly rather than on `DiscogsError` alone. An unexpected throw
       * from a malformed payload is precisely the case where one dead record
       * must not cost the other forty.
       */
      if (cause instanceof DiscogsError && cause.status === 404) {
        skipped += 1;
        continue;
      }

      failed += 1;
      // Named, not swallowed: a weekly job nobody watches needs its failures in
      // a log, and `describeError` redacts the cause chain (R6).
      logger.error(
        'refresh-prices',
        `release ${target.discogsReleaseId} (record ${target.recordId}): ${describeError(cause)}`,
      );
    }
  }

  /**
   * **The counts are the point of the response, not decoration.**
   *
   * A run that writes zero rows and a run that never happened are the same
   * observation from outside. R6's rule — assert the state, not the exit code —
   * applies to a cron's own report: `attempted` says the work was found,
   * `skipped` and `failed` say what absence meant, and a caller (or a human
   * reading a GitHub Actions log) can tell a quiet week from a broken one.
   */
  return NextResponse.json({
    data: { attempted: targets.length, written, skipped, failed },
  });
});
