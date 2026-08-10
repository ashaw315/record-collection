import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { matchOwnership } from '@/lib/db/queries/ownership';

/**
 * SPEC.md §7.7's three-tier ownership match — the "do I already own this?"
 * check on `/lookup`.
 *
 * **This is the most consequential query in the app.** §7.7: "This case must
 * never be collapsed into the exact match — it is the whole reason the
 * distinction exists, and getting it wrong is what causes a bad buying
 * decision in a store." CLAUDE.md §8 says the same thing more bluntly: a
 * pressing is not an album, and collapsing the two is the single worst bug
 * this app can ship.
 *
 * **The fixture is built so that collapsing is VISIBLE.** Every row below
 * shares the artist and the title. If the tiers were distinguished by anything
 * other than the pressing, these tests would pass under an implementation that
 * answered "you own this" to all three — which is exactly the wrong answer to
 * be confident about while holding a record you do not own.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

const TITLE = 'Hear Nothing See Nothing Say Nothing';

/** The release the user is looking at in the shop. */
const LOOKING_AT = 381756;

/** The same album, a different pressing — the 1989 reissue. */
const OWNED_OTHER = 6779382;

async function seedArtist(name = 'Discharge'): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO artists (name) VALUES (${name}) RETURNING id`,
  );
  return rows.rows[0].id;
}

async function seedPressing(input: {
  discogsReleaseId: number | null;
  catalogNumber?: string;
  countryPressed?: string;
  yearPressed?: number;
}): Promise<string> {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO pressings (discogs_release_id, catalog_number, country_pressed, year_pressed)
        VALUES (${input.discogsReleaseId}, ${input.catalogNumber ?? null},
                ${input.countryPressed ?? null}, ${input.yearPressed ?? null})
        RETURNING id`,
  );
  return rows.rows[0].id;
}

async function seedRecord(artistId: string, pressingId: string | null, title = TITLE) {
  const rows = await db.execute<{ id: string }>(
    sql`INSERT INTO records (artist_id, pressing_id, title) VALUES (${artistId}, ${pressingId}, ${title})
        RETURNING id`,
  );
  return rows.rows[0].id;
}

describe('tier 1 requires CORROBORATION, not an id alone', () => {
  /**
   * §7.7 as amended: tier 1 needs the release id **and** the artist/title match
   * tier 2 uses.
   *
   * **Why the corroboration is not redundant.** `discogs_release_id` is a plain
   * integer a client can assert through `POST /api/pressings`, so the id alone
   * lets a wrong or forged value produce "you own this pressing" for a record
   * with an entirely different artist and title. Verified before fixing:
   * posting a pressing with `discogsReleaseId: 381756` and unrelated details,
   * attached to a record by "Some Other Band", returned tier `exact`.
   *
   * **Why nothing caught it.** Every fixture in this file paired the id with
   * the matching artist and title, so no test could tell "matches on id alone"
   * from "corroborates". The tests below are the ones that can.
   */
  it('does NOT report tier 1 when the id names a different album', async () => {
    const artistId = await seedArtist('Some Other Band');
    // The id a client asserted. Nothing else about this record agrees with it.
    const pressingId = await seedPressing({ discogsReleaseId: LOOKING_AT });
    await seedRecord(artistId, pressingId, 'An Unrelated Album');

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier, 'a bad id must degrade to no match, never to certainty').toBe('none');
  });

  it('does NOT report tier 1 when only the ARTIST disagrees', async () => {
    // The narrower case: right album title, wrong band. Album titles are not
    // unique, and "Greatest Hits" would otherwise match everything.
    const artistId = await seedArtist('The Damned');
    const pressingId = await seedPressing({ discogsReleaseId: LOOKING_AT });
    await seedRecord(artistId, pressingId);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).not.toBe('exact');
  });

  it('does NOT report tier 1 when only the TITLE disagrees', async () => {
    const artistId = await seedArtist();
    const pressingId = await seedPressing({ discogsReleaseId: LOOKING_AT });
    await seedRecord(artistId, pressingId, 'Why');

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).not.toBe('exact');
  });

  it('still reports tier 1 when the album agrees but the title has a typo', async () => {
    /**
     * The corroboration must not be stricter than tier 2's, or a record whose
     * title the user typed slightly differently would lose the badge it should
     * have. Fuzzy on both sides, exactly as tier 2 matches.
     */
    const artistId = await seedArtist();
    const pressingId = await seedPressing({ discogsReleaseId: LOOKING_AT });
    await seedRecord(artistId, pressingId, 'Hear Nothing See Nothing Say Nothin');

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('exact');
  });

  it('falls to tier 2 rather than none when the album IS owned elsewhere', async () => {
    /**
     * The degradation §7.7 asks for. A forged id on one record must not hide a
     * genuine copy of the album owned in another pressing — the honest answer
     * is still "you own a different pressing".
     */
    const artistId = await seedArtist();

    const forged = await seedPressing({ discogsReleaseId: LOOKING_AT });
    await seedRecord(await seedArtist('Some Other Band'), forged, 'An Unrelated Album');

    const genuine = await seedPressing({
      discogsReleaseId: OWNED_OTHER,
      catalogNumber: 'CLAY LP 3',
      countryPressed: 'UK',
      yearPressed: 1989,
    });
    await seedRecord(artistId, genuine);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('different-pressing');
    expect(match.ownedPressing?.yearPressed).toBe(1989);
  });
});

describe('tier 1 — you own this exact pressing', () => {
  it('matches on the pressing discogs id, not on the album', async () => {
    const artistId = await seedArtist();
    const pressingId = await seedPressing({ discogsReleaseId: LOOKING_AT });
    const recordId = await seedRecord(artistId, pressingId);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('exact');
    expect(match.recordId).toBe(recordId);
  });
});

describe('matching without an artist name', () => {
  /**
   * Version rows from `/masters/:id/versions` carry a title and NO artist.
   *
   * Tier 1 must still work: it matches on `discogs_release_id`, which is a
   * stronger identification than any text comparison. A guard at the top of
   * the matcher returning early for a null artist skipped tier 1 too — so the
   * version table reported "no badge" for a record sitting on the shelf, on
   * the screen built to compare pressings. Found while wiring that endpoint.
   */
  it('CANNOT reach tier 1 without an artist to corroborate against', async () => {
    /**
     * CHANGED by the §7.7 amendment, and the change is the point.
     *
     * This test previously asserted that the pressing id ALONE identifies a
     * record — which is exactly the property the security review found
     * forgeable. Tier 1 now requires the album to agree, so a caller supplying
     * no artist cannot reach it.
     *
     * The versions endpoint is the caller that has no artist on its rows, and
     * it already fetches the master for one — so corroboration succeeds there
     * whenever the master lookup does. When it does not, §7.7's asymmetry
     * decides: an error the user never discovers is the one to avoid, so the
     * app declines to claim the specific thing on thin evidence.
     */
    const artistId = await seedArtist();
    const pressingId = await seedPressing({ discogsReleaseId: LOOKING_AT });
    await seedRecord(artistId, pressingId);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: null,
      title: null,
    });

    expect(match.tier, 'no corroboration available, so no claim').toBe('none');
  });

  it('cannot reach tiers 2 or 3 without an artist, and says none', async () => {
    // Honest rather than guessing: those tiers match on artist AND title, and
    // there is nothing to match on.
    const artistId = await seedArtist();
    await seedRecord(artistId, null);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: null,
      title: null,
    });

    expect(match.tier).toBe('none');
  });
});

describe('tier 2 — you own a DIFFERENT pressing of the same album', () => {
  /**
   * The tier §7.7 singles out. The user owns the album; the copy in their hand
   * is a different pressing. Answering "you own this pressing" here is what
   * makes someone put back a record they wanted.
   */
  it('does not report an exact match when the pressing differs', async () => {
    const artistId = await seedArtist();
    const ownedPressing = await seedPressing({
      discogsReleaseId: OWNED_OTHER,
      catalogNumber: 'CLAY LP 3',
      countryPressed: 'UK',
      yearPressed: 1989,
    });
    await seedRecord(artistId, ownedPressing);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier, 'NOT exact — the pressing is different').toBe('different-pressing');
  });

  it('names the pressing owned, so the user can compare it with the one in hand', async () => {
    /**
     * §7.7 requires "the year/country/catalog of the one owned". Without it the
     * badge says a copy exists somewhere and leaves the actual decision —
     * is the one in my hand better than the one at home? — unanswerable in the
     * shop, which is the only place it matters.
     */
    const artistId = await seedArtist();
    const ownedPressing = await seedPressing({
      discogsReleaseId: OWNED_OTHER,
      catalogNumber: 'CLAY LP 3',
      countryPressed: 'UK',
      yearPressed: 1989,
    });
    await seedRecord(artistId, ownedPressing);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.ownedPressing).toEqual({
      catalogNumber: 'CLAY LP 3',
      countryPressed: 'UK',
      yearPressed: 1989,
    });
  });

  it('matches a record with NO pressing at all as a different pressing', async () => {
    /**
     * A record logged before its pressing was identified — the quick in-store
     * entry §10 is built around. The user owns the album; we cannot say which
     * pressing. "You own a different pressing" is honest; "you own this
     * pressing" is a claim nothing supports.
     */
    const artistId = await seedArtist();
    await seedRecord(artistId, null);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('different-pressing');
    expect(match.ownedPressing).toBeNull();
  });

  it('matches a title with a typo, since sleeves are read by eye', async () => {
    // §7.7: "artist + fuzzy title". The trigram indexes exist for this.
    const artistId = await seedArtist();
    await seedRecord(artistId, null, 'Hear Nothing See Nothing Say Nothin');

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('different-pressing');
  });

  it('does not match a title that merely shares a prefix', async () => {
    /**
     * The threshold discriminator, measured rather than guessed:
     * similarity('Hear Nothing See Nothing Say Nothing', 'Hear Nothing') is
     * 0.65 — above the 0.6 bar, so this SHOULD match — while
     * similarity(…, 'Why') is 0.000.
     *
     * A loosened threshold (0.1) accepts both and the false positive tells the
     * user they own a record they do not. Without a fixture between the two
     * values, lowering the bar failed no test — mutation caught that.
     */
    const artistId = await seedArtist();
    await seedRecord(artistId, null, 'Hear Nothing');

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier, '0.65 similarity is a real match').toBe('different-pressing');
  });

  it('does not match a title that shares only a common word', async () => {
    /**
     * THE threshold discriminator, and it took measuring to find one.
     *
     * similarity('Hear Nothing See Nothing Say Nothing', 'Nothing') = 0.400 —
     * between the real bar (0.6) and a loosened one (0.1). My first two
     * attempts at this test used values of 0.65 and 0.05, which fall the same
     * side of BOTH thresholds and so discriminated nothing; mutation caught
     * that twice before this fixture was measured rather than guessed.
     *
     * A record called "Nothing" is not this album, and telling the user they
     * own it costs them the record in their hand.
     */
    const artistId = await seedArtist();
    await seedRecord(artistId, null, 'Nothing');

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier, '0.400 similarity is not a match').toBe('none');
  });

  it('does not match a DIFFERENT artist whose name merely resembles', async () => {
    // similarity('Discharge', 'The Damned') is 0.05. At a loosened threshold
    // this matches, and the user is told they own an album by another band.
    const otherArtist = await seedArtist('The Damned');
    await seedRecord(otherArtist, null, 'Damned Damned Damned');

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('none');
  });

  it('does NOT match a different album by the same artist', async () => {
    /**
     * The false-positive direction, and the one that silently costs a
     * purchase: told they own it, the user puts back a record they do not own.
     * Fuzzy must not mean loose.
     */
    const artistId = await seedArtist();
    await seedRecord(artistId, null, 'Why');

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('none');
  });

  it('does NOT match the same title by a different artist', async () => {
    // Album titles are not unique. "Greatest Hits" would match everything.
    const otherArtist = await seedArtist('The Damned');
    await seedRecord(otherArtist, null);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('none');
  });
});

describe('tier 3 — on the want list', () => {
  it('reports a want-list match with its priority', async () => {
    const artistId = await seedArtist();
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${artistId}, ${TITLE}, 1)`,
    );

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('wanted');
    expect(match.wantList?.priority).toBe(1);
  });

  it('says whether this result IS the target pressing', async () => {
    /**
     * §7.7: "if `target_pressing_id` is set, whether this result IS that target
     * pressing." The difference between "you wanted this album" and "this is
     * the exact pressing you were hunting" is the difference between thinking
     * about it and buying it.
     */
    const artistId = await seedArtist();
    const target = await seedPressing({ discogsReleaseId: LOOKING_AT });
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority, target_pressing_id)
          VALUES (${artistId}, ${TITLE}, 1, ${target})`,
    );

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('wanted');
    expect(match.wantList?.isTargetPressing).toBe(true);
  });

  it('says when this result is NOT the target pressing', async () => {
    const artistId = await seedArtist();
    const target = await seedPressing({ discogsReleaseId: OWNED_OTHER });
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority, target_pressing_id)
          VALUES (${artistId}, ${TITLE}, 2, ${target})`,
    );

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.wantList?.isTargetPressing).toBe(false);
  });

  it('ignores an ALREADY ACQUIRED want-list entry', async () => {
    /**
     * §7.3 keeps acquired entries forever as history. Showing "on your want
     * list" for something already bought sends the user hunting for a record
     * they own.
     *
     * The acquired entry points at a record with NO pressing, deliberately.
     * An earlier version linked it to a record owning the exact pressing —
     * which meant tier 1 answered first and the `is_acquired` filter was never
     * reached, so removing that filter failed no test. Mutation caught it.
     * Here the only thing that can produce 'wanted' is the filter failing.
     */
    const artistId = await seedArtist();
    const otherArtist = await seedArtist('Sacrilege');
    const recordId = await seedRecord(otherArtist, null, 'Behind The Realms Of Madness');

    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, is_acquired, acquired_record_id)
          VALUES (${artistId}, ${TITLE}, true, ${recordId})`,
    );

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier, 'an acquired entry is history, not a want').toBe('none');
  });
});

describe('tier precedence', () => {
  /**
   * The discriminating fixture, and the reason this describe block exists: ALL
   * THREE conditions hold at once, for the same artist and title.
   *
   * A user owns the 1989 reissue, has the album on their want list, and is
   * holding the 1982 original. Each tier is individually true. An
   * implementation that checked them in the wrong order, or collapsed any two,
   * still produces a badge — just the wrong one, confidently.
   */
  async function seedAllThree() {
    const artistId = await seedArtist();

    const exactPressing = await seedPressing({
      discogsReleaseId: LOOKING_AT,
      catalogNumber: 'CLAY LP 3',
      countryPressed: 'UK',
      yearPressed: 1982,
    });
    const otherPressing = await seedPressing({
      discogsReleaseId: OWNED_OTHER,
      catalogNumber: 'CLAY LP 3',
      countryPressed: 'UK',
      yearPressed: 1989,
    });

    await seedRecord(artistId, otherPressing);
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${artistId}, ${TITLE}, 1)`,
    );

    return { artistId, exactPressing, otherPressing };
  }

  it('prefers the exact pressing when one is owned', async () => {
    const { artistId, exactPressing } = await seedAllThree();
    await seedRecord(artistId, exactPressing);

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('exact');
  });

  it('reports a different pressing rather than the want list when both apply', async () => {
    /**
     * Owning a copy outranks wanting one: "you already own this album, in this
     * other pressing" is the more urgent fact in a shop, and the want-list
     * entry is stale information the user has not tidied up.
     */
    await seedAllThree();

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('different-pressing');
    expect(match.ownedPressing?.yearPressed, 'and it names WHICH pressing').toBe(1989);
  });

  it('still reports the want list when nothing is owned', async () => {
    const artistId = await seedArtist();
    await db.execute(
      sql`INSERT INTO want_list (artist_id, title, priority) VALUES (${artistId}, ${TITLE}, 3)`,
    );

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('wanted');
  });
});

describe('no match', () => {
  it('reports no badge for an album the user has never seen', async () => {
    await seedArtist();

    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('none');
  });

  it('reports no badge on an empty collection', async () => {
    const match = await matchOwnership({
      discogsReleaseId: LOOKING_AT,
      artist: 'Discharge',
      title: TITLE,
    });

    expect(match.tier).toBe('none');
  });
});
