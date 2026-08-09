import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { discogsCache } from '@/db/schema';

/**
 * The Discogs release cache (SPEC.md §6).
 *
 * Release detail is cached; **search results are not**. That asymmetry is
 * deliberate and worth stating, because caching everything looks like the
 * tidier design: a release is a stable description of a physical object that
 * changes only when a Discogs contributor edits it, whereas a search is a
 * question whose answer depends on what the user typed and on the whole
 * database. Caching searches would serve yesterday's answer to today's
 * question, and the in-store flow (§10) is exactly where that misleads.
 *
 * The clock is injected on both entry points so freshness can be tested at the
 * boundary rather than near it — see the tests, where entries sit at 6, exactly
 * 7 and 8 days, since `<` and `<=` agree everywhere else.
 */

/** §6: "Serve from cache if `fetched_at` is under 7 days old." */
export const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type CachedRelease = {
  payload: unknown;
  fetchedAt: Date;
};

/**
 * The cached release, or `null` when there is nothing fresh enough to use.
 *
 * A stale entry reads as a miss but is LEFT IN PLACE. The refresh that follows
 * can fail — Discogs can be down, or rate-limiting us — and a stale payload
 * beats an empty form when that happens. Deleting on read would turn a
 * temporary outage into permanent loss.
 */
export async function readCachedRelease(
  discogsReleaseId: number,
  now: () => number = Date.now,
): Promise<CachedRelease | null> {
  const db = getDb();

  const [row] = await db
    .select({ payload: discogsCache.payload, fetchedAt: discogsCache.fetchedAt })
    .from(discogsCache)
    .where(eq(discogsCache.discogsReleaseId, discogsReleaseId))
    .limit(1);

  if (row === undefined) return null;

  // "Under 7 days" — strictly. Exactly 7 days old is a miss, which is the one
  // case that distinguishes this from `<=`.
  const age = now() - row.fetchedAt.getTime();
  if (age >= CACHE_TTL_MS) return null;

  return { payload: row.payload, fetchedAt: row.fetchedAt };
}

/**
 * Stores or refreshes a release payload.
 *
 * An UPSERT rather than an insert: `discogs_release_id` is unique, and
 * re-fetching a release whose entry has expired is the normal path. `fetched_at`
 * moves forward with the payload — refreshing the data while leaving an old
 * timestamp would serve the new payload once and then treat it as stale for
 * ever.
 */
export async function writeCachedRelease(
  discogsReleaseId: number,
  payload: unknown,
  now: () => number = Date.now,
): Promise<void> {
  const db = getDb();
  const fetchedAt = new Date(now());

  await db
    .insert(discogsCache)
    .values({ discogsReleaseId, payload, fetchedAt })
    .onConflictDoUpdate({
      target: discogsCache.discogsReleaseId,
      set: { payload, fetchedAt },
    });
}
