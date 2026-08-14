import 'server-only';
import { eq } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { musicbrainzCache } from '@/db/schema';

/**
 * The MusicBrainz artist cache (SPEC.md §4.3).
 *
 * **Keyed on the MBID, never on a local artist id.** The same person reached
 * through two different bands' lineups is one fetch — and at one request per
 * second, every avoidable fetch is a second the user waits.
 *
 * **Stores the RAW payload**, never the normalized relations. Normalization is
 * our code and it changes; caching its output would freeze today's decisions
 * into rows that outlive them by ninety days, and a later fix to
 * `normalizeRelations` would never reach anything already fetched.
 */

/**
 * **90 days, not the 7 used elsewhere in this codebase — deliberately.**
 *
 * Lineups change on the scale of years; prices change weekly. Inheriting §6's
 * rule would mean re-walking thirty-odd requests for a fact that has not moved
 * since 1982. Do not "fix" this to match the others.
 */
export const MUSICBRAINZ_CACHE_TTL_MS = 90 * 24 * 60 * 60 * 1000;

export type CachedArtist = {
  /** The raw payload as MusicBrainz returned it. */
  relations: unknown;
  payload: unknown;
  fetchedAt: Date;
};

/**
 * The cached payload, or `null` when nothing fresh enough exists.
 *
 * A stale entry reads as a miss but is LEFT IN PLACE (§4.3, matching §6): the
 * refresh that follows can fail, and three-month-old lineups beat nothing when
 * MusicBrainz is down.
 */
export async function readCachedArtist(
  musicbrainzId: string,
  now: () => number = Date.now,
): Promise<CachedArtist | null> {
  const db = getDb();

  const [row] = await db
    .select({ payload: musicbrainzCache.payload, fetchedAt: musicbrainzCache.fetchedAt })
    .from(musicbrainzCache)
    .where(eq(musicbrainzCache.musicbrainzId, musicbrainzId))
    .limit(1);

  if (row === undefined) return null;

  const age = now() - row.fetchedAt.getTime();
  if (age >= MUSICBRAINZ_CACHE_TTL_MS) return null;

  const payload = row.payload as { relations?: unknown };

  return { relations: payload?.relations, payload: row.payload, fetchedAt: row.fetchedAt };
}

/**
 * Stores or refreshes an artist payload.
 *
 * An UPSERT: `musicbrainz_id` is unique and re-fetching an expired artist is the
 * normal path. `fetched_at` moves with the payload — refreshing the data while
 * leaving an old timestamp would serve the new payload once and then treat it as
 * stale for ever.
 */
export async function writeCachedArtist(
  musicbrainzId: string,
  payload: unknown,
  now: () => number = Date.now,
): Promise<void> {
  const db = getDb();
  const fetchedAt = new Date(now());

  await db
    .insert(musicbrainzCache)
    .values({ musicbrainzId, payload, fetchedAt })
    .onConflictDoUpdate({
      target: musicbrainzCache.musicbrainzId,
      set: { payload, fetchedAt },
    });
}
