import 'server-only';
import { and, eq, sql } from 'drizzle-orm';
import { getDb } from '@/db/client';
import { artists, pressings, records, wantList } from '@/db/schema';

/**
 * SPEC.md §7.7's three-tier ownership match.
 *
 * **The most consequential query in this application.** §7.7 is unusually
 * direct about why: "This case must never be collapsed into the exact match —
 * it is the whole reason the distinction exists, and getting it wrong is what
 * causes a bad buying decision in a store." CLAUDE.md §8 calls collapsing a
 * pressing into an album the single worst bug this app can ship.
 *
 * Two failures are possible and they are not symmetric:
 *
 *   - saying "you own this pressing" when the user owns a DIFFERENT one makes
 *     them put back a record they wanted, and they never find out;
 *   - saying "you own a different pressing" when they own this exact one makes
 *     them buy a duplicate, which they discover at home.
 *
 * The first is worse and is the one the tiering exists to prevent, so the exact
 * tier requires positive evidence — a pressing row carrying the same
 * `discogs_release_id` — and everything short of that falls to tier 2.
 */

export type OwnershipTier = 'exact' | 'different-pressing' | 'wanted' | 'none';

export type OwnedPressing = {
  catalogNumber: string | null;
  countryPressed: string | null;
  yearPressed: number | null;
};

export type OwnershipMatch = {
  tier: OwnershipTier;
  recordId: string | null;
  /**
   * §7.7 requires tier 2 to carry "the year/country/catalog of the one owned".
   * Without it the badge reports that a copy exists somewhere and leaves the
   * actual question — is the one in my hand better than the one at home? —
   * unanswerable in the only place it gets asked.
   *
   * Null when the owned record has no pressing recorded, which is honest: we
   * know they own the album and not which pressing.
   */
  ownedPressing: OwnedPressing | null;
  wantList: {
    id: string;
    priority: number;
    /** §7.7: "whether this result IS that target pressing." */
    isTargetPressing: boolean;
  } | null;
};

/**
 * §7.7: "artist + fuzzy title".
 *
 * 0.6 is deliberately high. Fuzzy must not mean loose: a false positive tells
 * the user they own something they do not, which costs them the record. At 0.6
 * a dropped character still matches ("Say Nothin" against "Say Nothing") while
 * two different albums by one artist do not.
 */
const TITLE_SIMILARITY_THRESHOLD = 0.6;

const NONE: OwnershipMatch = {
  tier: 'none',
  recordId: null,
  ownedPressing: null,
  wantList: null,
};

export async function matchOwnership(input: {
  discogsReleaseId: number;
  artist: string | null;
  title: string | null;
}): Promise<OwnershipMatch> {
  if (input.artist === null || input.title === null) return NONE;

  const db = getDb();

  /**
   * TIER 1: a record whose pressing carries this exact `discogs_release_id`.
   *
   * Matched on the PRESSING alone, not on artist or title. The pressing id is
   * a stronger identification than any text comparison, and requiring the text
   * to agree as well would demote a correctly-identified pressing to tier 2
   * because the user typed a different title.
   */
  const [exact] = await db
    .select({
      recordId: records.id,
      catalogNumber: pressings.catalogNumber,
      countryPressed: pressings.countryPressed,
      yearPressed: pressings.yearPressed,
    })
    .from(records)
    .innerJoin(pressings, eq(pressings.id, records.pressingId))
    .where(eq(pressings.discogsReleaseId, input.discogsReleaseId))
    .limit(1);

  if (exact !== undefined) {
    return {
      tier: 'exact',
      recordId: exact.recordId,
      ownedPressing: {
        catalogNumber: exact.catalogNumber,
        countryPressed: exact.countryPressed,
        yearPressed: exact.yearPressed,
      },
      wantList: null,
    };
  }

  /**
   * TIER 2: the same album, some other pressing — or no pressing recorded.
   *
   * The LEFT JOIN is load-bearing. A record logged before its pressing was
   * identified (§10's quick in-store entry) has `pressing_id` null, and an
   * inner join would silently drop it — reporting "no match" for an album the
   * user demonstrably owns, which is the false-negative that sends them home
   * with a second copy.
   */
  const [owned] = await db
    .select({
      recordId: records.id,
      catalogNumber: pressings.catalogNumber,
      countryPressed: pressings.countryPressed,
      yearPressed: pressings.yearPressed,
      hasPressing: sql<boolean>`${records.pressingId} IS NOT NULL`,
    })
    .from(records)
    .innerJoin(artists, eq(artists.id, records.artistId))
    .leftJoin(pressings, eq(pressings.id, records.pressingId))
    .where(
      and(
        sql`similarity(${artists.name}, ${input.artist}) > ${TITLE_SIMILARITY_THRESHOLD}`,
        sql`similarity(${records.title}, ${input.title}) > ${TITLE_SIMILARITY_THRESHOLD}`,
      ),
    )
    .limit(1);

  if (owned !== undefined) {
    return {
      tier: 'different-pressing',
      recordId: owned.recordId,
      ownedPressing: owned.hasPressing
        ? {
            catalogNumber: owned.catalogNumber,
            countryPressed: owned.countryPressed,
            yearPressed: owned.yearPressed,
          }
        : null,
      wantList: null,
    };
  }

  /**
   * TIER 3: on the want list and not yet acquired.
   *
   * Ranked below owning a copy because "you already own this album" is the more
   * urgent fact in a shop — a want-list entry for something already bought is
   * stale information the user has not tidied up, and §7.3 keeps acquired
   * entries forever precisely so it can be.
   */
  const [wanted] = await db
    .select({
      id: wantList.id,
      priority: wantList.priority,
      targetDiscogsReleaseId: pressings.discogsReleaseId,
    })
    .from(wantList)
    .innerJoin(artists, eq(artists.id, wantList.artistId))
    .leftJoin(pressings, eq(pressings.id, wantList.targetPressingId))
    .where(
      and(
        eq(wantList.isAcquired, false),
        sql`similarity(${artists.name}, ${input.artist}) > ${TITLE_SIMILARITY_THRESHOLD}`,
        sql`similarity(${wantList.title}, ${input.title}) > ${TITLE_SIMILARITY_THRESHOLD}`,
      ),
    )
    .limit(1);

  if (wanted !== undefined) {
    return {
      tier: 'wanted',
      recordId: null,
      ownedPressing: null,
      wantList: {
        id: wanted.id,
        priority: wanted.priority,
        isTargetPressing: wanted.targetDiscogsReleaseId === input.discogsReleaseId,
      },
    };
  }

  return NONE;
}
