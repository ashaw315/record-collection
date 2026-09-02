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

/**
 * §7.7 resolved for a whole page of search results.
 *
 * §10 puts a badge on every result card and a Discogs page is 25-50 rows, so
 * the alternative is one round trip per card before the screen can render — on
 * a phone, in a shop, which is the worst place to be doing that.
 *
 * **Delegates to `matchOwnership` rather than reimplementing the tiering.**
 * The tiering is the rule §7.7 spends a paragraph on and CLAUDE.md §8 calls the
 * worst thing to get wrong; a second implementation optimised for batching is
 * how the two would come to disagree, with the screen showing whichever one
 * nothing tested. A test asserts they agree row by row.
 *
 * Concurrent rather than sequential: the queries are independent reads, so the
 * latency is one round trip rather than N.
 */
export async function matchOwnershipForResults(
  results: Array<{ discogsId: number; artist: string | null; title: string | null }>,
): Promise<Map<number, OwnershipMatch>> {
  const matches = await Promise.all(
    results.map(async (result) => {
      const match = await matchOwnership({
        discogsReleaseId: result.discogsId,
        artist: result.artist,
        title: result.title,
      });

      return [result.discogsId, match] as const;
    }),
  );

  return new Map(matches);
}

export async function matchOwnership(input: {
  discogsReleaseId: number;
  artist: string | null;
  title: string | null;
}): Promise<OwnershipMatch> {
  const db = getDb();

  /**
   * TIER 1: this exact `discogs_release_id`, CORROBORATED by the album.
   *
   * §7.7 as amended: the id **and** the artist/title match tier 2 uses.
   *
   * An earlier version matched on the pressing id alone, reasoning that it is
   * a stronger identification than any text comparison. It is — when it is
   * true. But `discogs_release_id` is a plain integer a client can assert
   * through `POST /api/pressings`, so the id alone let a wrong or forged value
   * produce "you own this pressing" for a record with an entirely different
   * artist and title. Verified before the fix: a pressing posted with this id
   * and unrelated details, attached to a record by "Some Other Band", returned
   * `exact`.
   *
   * The corroboration is FUZZY, deliberately matching tier 2's threshold
   * rather than being stricter. A record whose title the user typed slightly
   * differently must not lose the badge it should have — the point is to
   * reject a wrong album, not to demand an exact string.
   *
   * When corroboration fails the query simply finds nothing and the tiers below
   * answer, which is the degradation §7.7 asks for: a bad id becomes tier 2 or
   * no badge rather than a confident wrong answer.
   */
  /**
   * **The want list is resolved for EVERY tier, not only when nothing is owned.**
   *
   * It used to be tier 3's body, reached only after tiers 1 and 2 had missed —
   * so an owned album always reported `wantList: null`, and the state that
   * matters most in a shop was unreachable: *you own a different pressing AND
   * this exact one is what you have been hunting*. That is the buy signal, and
   * it was indistinguishable from an ordinary tier 2.
   *
   * **The stale entry is the normal case, not corruption.** Ownership and
   * `is_acquired` are independent: the acquire flow sets the flag, but a record
   * added any other way — direct entry, an import, a purchase logged separately
   * — leaves the want row untouched at false. §7.3 keeps acquired rows forever
   * as history and nothing tidies the un-acquired ones. So a want entry on an
   * owned album is a thing the app holds on purpose, and it must be RENDERABLE
   * rather than filtered away.
   *
   * **The tier ORDER is unchanged.** §7.7 ranks owning above wanting and that
   * reasoning still holds — "you already own this album" is the more urgent
   * fact. What changes is that the tier no longer destroys the other half of
   * the answer on its way out.
   *
   * **Resolved BEFORE tier 1**, because tier 1 returns early and would
   * otherwise never see it. `findWantEntry` returns null for a null artist or
   * title, which is why it is safe here: tier 1 alone can match without them
   * (on `discogs_release_id`), and the tiers below guard separately.
   */
  const wantEntry = await findWantEntry(db, input);

  const [exact] =
    input.artist === null || input.title === null
      ? []
      : await db
          .select({
            recordId: records.id,
            catalogNumber: pressings.catalogNumber,
            countryPressed: pressings.countryPressed,
            yearPressed: pressings.yearPressed,
          })
          .from(records)
          .innerJoin(pressings, eq(pressings.id, records.pressingId))
          .innerJoin(artists, eq(artists.id, records.artistId))
          .where(
            and(
              eq(pressings.discogsReleaseId, input.discogsReleaseId),
              sql`similarity(${artists.name}, ${input.artist}) > ${TITLE_SIMILARITY_THRESHOLD}`,
              sql`similarity(${records.title}, ${input.title}) > ${TITLE_SIMILARITY_THRESHOLD}`,
            ),
          )
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
      wantList: wantEntry,
    };
  }

  /**
   * Tiers 2 and 3 match on artist AND title, so they cannot run without both.
   * Tier 1 above CAN — it matches on `discogs_release_id` alone, which is a
   * stronger identification than any text comparison.
   *
   * The guard used to sit at the top of this function and returned NONE for a
   * null artist, silently skipping tier 1 as well. That was invisible while
   * every caller had an artist; the versions endpoint does not, because
   * Discogs' version rows carry a title and no artist — so a table of
   * pressings reported "no badge" for a record sitting on the shelf.
   */
  if (input.artist === null || input.title === null) return NONE;


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
    /**
     * ORDERED, because `.limit(1)` without it names an arbitrary copy — and
     * §7.7's badge is a comparison aid: someone deciding whether the record in
     * their hand beats the one at home needs to know WHICH one at home.
     *
     * Most identifying detail first, so the badge names the copy the user can
     * actually recognise on the shelf rather than one logged fast with no
     * pressing. `records.id` last makes it deterministic — an answer that
     * changes between identical queries is worse than a consistently
     * imperfect one, because nothing signals that it moved.
     */
    .orderBy(
      sql`(${records.pressingId} IS NOT NULL) DESC`,
      sql`(${pressings.yearPressed} IS NOT NULL) DESC`,
      sql`(${pressings.catalogNumber} IS NOT NULL) DESC`,
      records.id,
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
      wantList: wantEntry,
    };
  }

  /**
   * TIER 3: on the want list and not yet acquired.
   *
   * Ranked below owning a copy because "you already own this album" is the more
   * urgent fact in a shop.
   *
   * **The lookup itself now happens above tier 1** (`wantEntry`), because the
   * want list is part of the answer at every tier rather than a fallback. This
   * branch is only about the TIER NAME: when nothing is owned, wanting is what
   * the badge leads with.
   */
  if (wantEntry !== null) {
    return {
      tier: 'wanted',
      recordId: null,
      ownedPressing: null,
      wantList: wantEntry,
    };
  }

  return NONE;
}

/**
 * The most urgent un-acquired want-list entry for this album, or null.
 *
 * **Extracted from tier 3 so every tier can carry it.** Left inline, it ran
 * only when nothing was owned — see the note at its call site.
 *
 * `is_acquired = false` is the filter, and the boundary of what this returns:
 * §7.3 keeps acquired rows forever as acquisition history, and surfacing one
 * would tell the user they are still hunting something they have already
 * bought. A row still sitting at false on an album they own is a different
 * thing entirely — an entry the app holds on purpose — and that is the one
 * this must return.
 *
 * Returns null without querying when the artist or title is absent: tier 1 can
 * match on `discogs_release_id` alone and calls this before the guard those
 * tiers use.
 */
async function findWantEntry(
  db: ReturnType<typeof getDb>,
  input: { discogsReleaseId: number; artist: string | null; title: string | null },
): Promise<OwnershipMatch['wantList']> {
  if (input.artist === null || input.title === null) return null;

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
    /**
     * The most urgent entry, then deterministic. §4.2 makes 1 the highest
     * priority, so a user with two entries for one album sees the one they
     * cared most about — and sees the same one on every search.
     */
    .orderBy(wantList.priority, wantList.id)
    .limit(1);

  if (wanted === undefined) return null;

  return {
    id: wanted.id,
    priority: wanted.priority,
    isTargetPressing: wanted.targetDiscogsReleaseId === input.discogsReleaseId,
  };
}
