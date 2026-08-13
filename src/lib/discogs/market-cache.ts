import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { marketCache } from '@/db/schema';

/**
 * The Discogs *market* cache (SPEC.md §10a, "Where it is cached").
 *
 * **A separate store from `src/lib/discogs/cache.ts`, not a second use of it.**
 * Both are keyed by `discogs_release_id`, which is exactly the trap: that table
 * holds release *detail*, read by the §5.7 import path to build records.
 * Marketplace figures written under the same key would be served to the
 * importer as a release payload.
 *
 * **This is what makes layer 3 affordable.** The version spread costs one
 * Discogs call per version — eleven for a single master, a fifth of the
 * per-minute budget — and without a cache every expand pays it again. With one,
 * a second expand of the same master is free, and any version already seen
 * through a search or an earlier expand is free the first time.
 *
 * The clock is injected on both entry points for the same reason it is in §6's
 * cache and in the limiter: freshness is then testable exactly ON the boundary
 * rather than near it.
 */

/** §10a inherits §6's rule: serve from cache if `fetched_at` is under 7 days old. */
export const MARKET_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Which §10a layers a cached row can answer for.
 *
 * **Two writers store different amounts of truth.** The market endpoint fetches
 * both layers; the spread fetches only `marketplace/stats` — the floor — one
 * call per version, because layer 2 would double a cost it already struggles to
 * afford. A floor-only row is a complete answer to "what is the cheapest copy"
 * and NOT an answer to "what does the condition ladder look like".
 *
 * Without this marker a floor-only row would be served as a full market reading
 * and render an empty ladder as a fact for seven days, which is the
 * absent-versus-unknown failure §10a exists to prevent.
 */
export type MarketLayer = 'floor' | 'ladder';

/** True when the row carries every layer the caller needs. */
export function cacheCovers(payload: unknown, needed: readonly MarketLayer[]): boolean {
  const fetched = (payload as { layersFetched?: unknown })?.layersFetched;

  // Rows written before the marker existed carry both layers — the market
  // endpoint was the only writer then.
  if (!Array.isArray(fetched)) return true;

  return needed.every((layer) => fetched.includes(layer));
}

/** The floor from a cached row, whichever writer stored it. */
export function cachedLowestPrice(payload: unknown): number | null {
  const value = (payload as { lowestPrice?: { value?: unknown } | null })?.lowestPrice?.value;
  return typeof value === 'number' ? value : null;
}

export type CachedMarket = {
  payload: unknown;
  fetchedAt: Date;
};

/**
 * The cached market payload, or `null` when nothing fresh enough exists.
 *
 * A stale entry reads as a miss but is **left in place** (§10a). The refresh
 * that follows a miss is precisely the call that can fail — Discogs down, or
 * rate-limiting us — and week-old figures still answer "is this shop above or
 * below the market", the question the feature exists for. Deleting on read
 * would turn a temporary outage into permanent loss.
 */
export async function readCachedMarket(
  discogsReleaseId: number,
  now: () => number = Date.now,
): Promise<CachedMarket | null> {
  const db = getDb();

  const [row] = await db
    .select({ payload: marketCache.payload, fetchedAt: marketCache.fetchedAt })
    .from(marketCache)
    .where(eq(marketCache.discogsReleaseId, discogsReleaseId))
    .limit(1);

  if (row === undefined) return null;

  // "Under 7 days" — strictly. Exactly 7 days old is a miss, the one case that
  // distinguishes this from `<=`.
  const age = now() - row.fetchedAt.getTime();
  if (age >= MARKET_CACHE_TTL_MS) return null;

  return { payload: row.payload, fetchedAt: row.fetchedAt };
}

/**
 * Stores or refreshes the market payload for a release.
 *
 * An UPSERT: `discogs_release_id` is unique and re-pricing an expired release
 * is the normal path. `fetched_at` moves forward with the payload — refreshing
 * the data while leaving an old timestamp would serve the new figures once and
 * then treat them as stale for ever.
 */
export async function writeCachedMarket(
  discogsReleaseId: number,
  payload: unknown,
  now: () => number = Date.now,
): Promise<void> {
  const db = getDb();
  const fetchedAt = new Date(now());

  await db
    .insert(marketCache)
    .values({ discogsReleaseId, payload, fetchedAt })
    .onConflictDoUpdate({
      target: marketCache.discogsReleaseId,
      set: { payload, fetchedAt },
    });
}
