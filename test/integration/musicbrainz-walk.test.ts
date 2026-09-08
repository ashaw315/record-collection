import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sql } from 'drizzle-orm';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { walkLineup } from '@/lib/musicbrainz/walk-lineup';
import {
  MUSICBRAINZ_CACHE_TTL_MS,
  readCachedArtist,
  writeCachedArtist,
} from '@/lib/musicbrainz/artist-cache';
import * as clientModule from '@/lib/musicbrainz/client';

/**
 * SPEC.md §12 step 11 — walking a band's lineup.
 *
 * **The cost is the design.** `member of band` links a person to a group, so
 * building one band's lineup graph means band → each member → that member's
 * other bands. Discharge is 31 members: 32 sequential requests, 32 seconds at
 * the permitted one per second.
 *
 * Two cases carry this unit, and neither is the happy path:
 *
 *   - **The SECOND walk.** A first walk succeeds under any implementation. Only
 *     a second walk sharing a member can show that the cache and the resolver
 *     are doing their jobs.
 *   - **Partial failure.** MusicBrainz's 503 is all-or-nothing and the client
 *     has already retried three times before the walk sees an error, so a
 *     refusal at request 20 of 32 is the NORMAL failure rather than the edge
 *     one.
 */

const db = getTestDb();

const DISCHARGE = { id: 'mb-discharge', name: 'Discharge' };
const BROKEN_BONES = { id: 'mb-broken-bones', name: 'Broken Bones' };
/** In both bands — the reason a second walk must not refetch. */
const SHARED = { id: 'mb-bones', name: 'Bones' };
const CAL = { id: 'mb-cal', name: 'Cal' };

/** A `member of band` relation as MusicBrainz returns it. */
function memberRel(person: { id: string; name: string }, direction = 'backward') {
  return {
    type: 'member of band',
    direction,
    'target-type': 'artist',
    attributes: ['guitar'],
    artist: { id: person.id, name: person.name, type: 'Person' },
  };
}

function bandRel(band: { id: string; name: string }) {
  return {
    type: 'member of band',
    direction: 'forward',
    'target-type': 'artist',
    attributes: ['guitar'],
    artist: { id: band.id, name: band.name, type: 'Group' },
  };
}

/**
 * A fake MusicBrainz. `failAfter` counts requests, so a walk can be stopped at
 * any point — which is how the partial case is reached without a live 503.
 */
function mockMusicBrainz(
  relationsByMbid: Record<string, unknown[]>,
  options: { failAfter?: number } = {},
) {
  let calls = 0;
  const requested: string[] = [];

  const get = vi.fn(async (path: string) => {
    calls += 1;
    const mbid = /artist\/([^?]+)/.exec(path)?.[1] ?? '';
    requested.push(mbid);

    if (options.failAfter !== undefined && calls > options.failAfter) {
      throw new clientModule.MusicBrainzError('rate limited', { status: 503 });
    }

    return { id: mbid, name: mbid, relations: relationsByMbid[mbid] ?? [] };
  });

  vi.spyOn(clientModule, 'getMusicBrainzClient').mockReturnValue({
    get: get as unknown as clientModule.MusicBrainzClient['get'],
  });

  return { get, requested };
}

const count = async (table: string, where = sql`TRUE`) => {
  const result = await db.execute<{ n: number }>(
    sql`SELECT COUNT(*)::int AS n FROM ${sql.identifier(table)} WHERE ${where}`,
  );
  return result.rows[0].n;
};

beforeEach(async () => {
  await truncateAll();
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeTestDb();
});

describe('the SECOND walk — what this unit has to get right', () => {
  it('does not refetch a person already seen through another band', async () => {
    /**
     * **The cache is keyed on the MBID, not on a local artist id** (§4.3), so
     * the same person reached through two lineups is one fetch. A local key
     * would refetch them — and at one request per second, every avoidable
     * fetch is a second the user waits.
     */
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED), memberRel(CAL)],
      [BROKEN_BONES.id]: [memberRel(SHARED)],
      [SHARED.id]: [bandRel(DISCHARGE), bandRel(BROKEN_BONES)],
      [CAL.id]: [bandRel(DISCHARGE)],
    };

    const first = mockMusicBrainz(relations);
    await walkLineup(DISCHARGE.id);
    const afterFirst = first.requested.filter((mbid) => mbid === SHARED.id).length;
    vi.restoreAllMocks();

    const second = mockMusicBrainz(relations);
    await walkLineup(BROKEN_BONES.id);

    expect(afterFirst, 'fetched once on the first walk').toBe(1);
    expect(
      second.requested.filter((mbid) => mbid === SHARED.id),
      'and not again on the second',
    ).toHaveLength(0);
  });

  it('does not duplicate the shared person as a local artist', async () => {
    /**
     * The resolver matches on MBID, so the second walk must find the row the
     * first created. A duplicate here would mean two "Bones" artists and a
     * lineup graph that draws them apart.
     */
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED)],
      [BROKEN_BONES.id]: [memberRel(SHARED)],
      [SHARED.id]: [bandRel(DISCHARGE), bandRel(BROKEN_BONES)],
    };

    mockMusicBrainz(relations);
    await walkLineup(DISCHARGE.id);
    vi.restoreAllMocks();

    mockMusicBrainz(relations);
    await walkLineup(BROKEN_BONES.id);

    expect(
      await count('artists', sql`musicbrainz_id = ${SHARED.id}`),
      'one row for one person',
    ).toBe(1);
  });

  it('re-walking the same band costs nothing', async () => {
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED)],
      [SHARED.id]: [bandRel(DISCHARGE)],
    };

    mockMusicBrainz(relations);
    await walkLineup(DISCHARGE.id);
    vi.restoreAllMocks();

    const again = mockMusicBrainz(relations);
    await walkLineup(DISCHARGE.id);

    expect(again.get, 'served entirely from cache').not.toHaveBeenCalled();
  });

  it('records the membership once, not once per walk', async () => {
    // §4.3's NULLS NOT DISTINCT does the work; this proves the walk relies on
    // it rather than accumulating rows.
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED)],
      [SHARED.id]: [bandRel(DISCHARGE)],
    };

    mockMusicBrainz(relations);
    await walkLineup(DISCHARGE.id);
    vi.restoreAllMocks();
    mockMusicBrainz(relations);
    await walkLineup(DISCHARGE.id);

    expect(await count('artist_memberships')).toBe(1);
  });
});

describe('partial failure — the normal failure, not the edge', () => {
  it('keeps what it resolved before the refusal', async () => {
    /**
     * Twenty members is real data. Discarding it because the twenty-first
     * request failed would throw away twenty seconds of a one-per-second budget
     * and make the next walk pay for it again.
     */
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED), memberRel(CAL)],
      [SHARED.id]: [bandRel(DISCHARGE)],
      [CAL.id]: [bandRel(DISCHARGE)],
    };

    // Band + first member succeed; the second member's fetch is refused.
    mockMusicBrainz(relations, { failAfter: 2 });

    const result = await walkLineup(DISCHARGE.id);

    expect(result.partial, 'and it says so').toBe(true);
    expect(await count('artists', sql`musicbrainz_id = ${SHARED.id}`)).toBe(1);

    /**
     * **The membership rows, not just the artists.** `resolveArtist` writes the
     * artist as a side effect of resolving it, so asserting on `artists` alone
     * passes even when the memberships are discarded — a mutation skipping
     * `saveMemberships` on a partial walk survived exactly that.
     *
     * Both members were resolved before the refusal (the loop pushes the
     * membership before fetching the person's other bands), so both rows must
     * be committed.
     */
    expect(await count('artist_memberships'), 'what was gathered is kept').toBe(2);
  });

  it('reports how many of how many were checked', async () => {
    /**
     * **Absent-versus-unknown, in the layer where it does most damage.** A
     * lineup that stopped at 20 must not read as a band with 20 members. The
     * denominator is known before any member is fetched — the band's own
     * relation list gives it.
     */
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED), memberRel(CAL)],
      [SHARED.id]: [bandRel(DISCHARGE)],
      [CAL.id]: [bandRel(DISCHARGE)],
    };

    mockMusicBrainz(relations, { failAfter: 2 });

    const result = await walkLineup(DISCHARGE.id);

    expect(result.checked).toBe(1);
    expect(result.total, 'the band said it had two').toBe(2);
    expect(result.text).toMatch(/1 of 2/);
    expect(result.text, 'and never claims completeness').toMatch(/stopped|more members|so far/i);
  });

  it('does NOT cache the band when the walk was cut short', async () => {
    /**
     * The asymmetry that matters: partial data is worth keeping in the
     * DATABASE and worth NOT keeping in the CACHE. Caching it would serve an
     * incomplete lineup for ninety days.
     */
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED), memberRel(CAL)],
      [SHARED.id]: [bandRel(DISCHARGE)],
      [CAL.id]: [bandRel(DISCHARGE)],
    };

    mockMusicBrainz(relations, { failAfter: 2 });
    await walkLineup(DISCHARGE.id);

    expect(
      await count('musicbrainz_cache', sql`musicbrainz_id = ${DISCHARGE.id}`),
      'the next walk must try again',
    ).toBe(0);
  });

  it('stops asking once refused rather than hammering the limiter', async () => {
    /**
     * The client has already retried three times with backoff, so an error
     * reaching here means four refusals — MusicBrainz is down or hard-limiting,
     * and continuing spends the remaining budget on failures while the user
     * waits.
     */
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED), memberRel(CAL), memberRel({ id: 'mb-x', name: 'X' })],
      [SHARED.id]: [bandRel(DISCHARGE)],
      [CAL.id]: [bandRel(DISCHARGE)],
      'mb-x': [bandRel(DISCHARGE)],
    };

    const { get } = mockMusicBrainz(relations, { failAfter: 2 });

    await walkLineup(DISCHARGE.id);

    expect(get.mock.calls.length, 'band, one member, one refusal, stop').toBe(3);
  });

  it('surfaces a failure on the BAND itself as a failed walk, not a partial one', async () => {
    // Nothing to be partial about: without the band's relation list there is no
    // lineup at all, which is "we could not ask" rather than "we asked about
    // some of them".
    mockMusicBrainz({}, { failAfter: 0 });

    await expect(walkLineup(DISCHARGE.id)).rejects.toThrow();
  });
});

describe('the complete walk', () => {
  it('records every membership it found', async () => {
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED), memberRel(CAL)],
      [SHARED.id]: [bandRel(DISCHARGE)],
      [CAL.id]: [bandRel(DISCHARGE)],
    };

    mockMusicBrainz(relations);

    const result = await walkLineup(DISCHARGE.id);

    expect(result.partial).toBe(false);
    expect(await count('artist_memberships')).toBe(2);
    expect(result.text, 'a complete lineup says so plainly').toMatch(/2 members/i);
  });

  it('follows members into their OTHER bands', async () => {
    /**
     * §12 step 11's actual purpose: "side-project relationships". Bones is in
     * Discharge and Broken Bones, and walking Discharge should discover the
     * second band — that shared member is what §8.1's `shared_member` edge is
     * drawn from.
     */
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED)],
      [SHARED.id]: [bandRel(DISCHARGE), bandRel(BROKEN_BONES)],
    };

    mockMusicBrainz(relations);
    await walkLineup(DISCHARGE.id);

    expect(
      await count('artists', sql`musicbrainz_id = ${BROKEN_BONES.id}`),
      'the side project was discovered',
    ).toBe(1);
    expect(await count('artist_memberships'), 'in both bands').toBe(2);
  });

  it('caches the band once the walk completes', async () => {
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED)],
      [SHARED.id]: [bandRel(DISCHARGE)],
    };

    mockMusicBrainz(relations);
    await walkLineup(DISCHARGE.id);

    expect(await count('musicbrainz_cache', sql`musicbrainz_id = ${DISCHARGE.id}`)).toBe(1);
  });
});

describe('the 90-day TTL (§4.3)', () => {
  /**
   * **Ninety days, not the seven used elsewhere — and the difference is
   * testable.** Every other test here runs against fresh entries, so 7 and 90
   * behave identically and a mutation changing the constant passed. These
   * fixtures sit ON the boundary, which is the only place the two rules
   * disagree.
   *
   * Lineups change on the scale of years; prices change weekly. Re-walking
   * thirty-odd requests every week for a fact that has not moved since 1982 is
   * what the longer TTL exists to prevent.
   */
  const DAY = 24 * 60 * 60 * 1000;
  const NOW = new Date('2026-08-14T12:00:00.000Z').getTime();
  const at = (days: number) => () => NOW - days * DAY;

  it('serves an entry 60 days old, which a 7-day rule would have expired', async () => {
    await writeCachedArtist('mb-x', { relations: [] }, at(60));

    expect(await readCachedArtist('mb-x', () => NOW), 'still fresh at 60 days').not.toBeNull();
  });

  it('treats an entry exactly 90 days old as a MISS', async () => {
    // The case that decides `<` from `<=`, matching §6's "under 7 days" wording.
    await writeCachedArtist('mb-x', { relations: [] }, at(90));

    expect(await readCachedArtist('mb-x', () => NOW)).toBeNull();
  });

  it('treats an older entry as a miss and LEAVES IT in place', async () => {
    /**
     * §4.3, matching §6: a stale entry reads as a miss but survives, so an
     * outage serves three-month-old lineups rather than nothing.
     */
    await writeCachedArtist('mb-x', { relations: [] }, at(120));

    expect(await readCachedArtist('mb-x', () => NOW)).toBeNull();
    expect(await count('musicbrainz_cache', sql`musicbrainz_id = 'mb-x'`)).toBe(1);
  });

  it('exports the TTL as ninety days', () => {
    expect(MUSICBRAINZ_CACHE_TTL_MS).toBe(90 * DAY);
  });
});

describe('incremental saves — progress the client can observe', () => {
  /**
   * A walk is ~32 sequential requests and 32 seconds. A spinner for that long
   * is indistinguishable from a hang, so `/manage` polls the membership count
   * to show "checked 12 of 31" — and that only works if rows land AS the walk
   * proceeds rather than in one batch at the end.
   *
   * It also makes the walk robust against a mid-way crash, which the
   * end-of-walk batch was not: a process killed at member 20 lost all twenty.
   */

  it('writes memberships DURING the walk, not only at the end', async () => {
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED), memberRel(CAL)],
      [SHARED.id]: [bandRel(DISCHARGE)],
      [CAL.id]: [bandRel(DISCHARGE)],
    };

    /**
     * Counted from inside the mock, between the first and second member's
     * fetches. Asserting after the walk cannot distinguish incremental from
     * batched — both end with two rows.
     */
    let rowsMidWalk: number | null = null;
    let memberFetches = 0;

    const get = vi.fn(async (path: string) => {
      const mbid = /artist\/([^?]+)/.exec(path)?.[1] ?? '';

      if (mbid !== DISCHARGE.id) {
        memberFetches += 1;
        if (memberFetches === 2) {
          rowsMidWalk = await count('artist_memberships');
        }
      }

      return { id: mbid, name: mbid, relations: relations[mbid] ?? [] };
    });
    vi.spyOn(clientModule, 'getMusicBrainzClient').mockReturnValue({
      get: get as unknown as clientModule.MusicBrainzClient['get'],
    });

    await walkLineup(DISCHARGE.id);

    expect(rowsMidWalk, 'the first member was already committed').toBeGreaterThan(0);
    expect(await count('artist_memberships'), 'and both are there at the end').toBe(2);
  });
});

/**
 * SPEC.md §9.1 (A48) — the walk records tribute and subgroup relations.
 *
 * **Integration rather than unit, because the claim spans three layers**: the
 * normalizer must extract them, the walk must resolve the artist and hand them
 * over, and the save must persist them. A unit test of any one passes while the
 * wiring between them is missing — which is exactly what shipped before A48:
 * the relations were in every cached payload and nothing read them.
 */
describe('tribute and subgroup relations are recorded (A48)', () => {
  const TRIBUTE = { id: 'mb-tribute-band', name: 'Dis-charge' };
  const REUNION = { id: 'mb-reunion', name: 'Discharge Reunited' };

  function derivedRel(band: { id: string; name: string }, type: 'tribute' | 'subgroup') {
    return {
      type,
      direction: 'backward',
      'target-type': 'artist',
      artist: { id: band.id, name: band.name, type: 'Group' },
    };
  }

  it('writes a row for each, from the band fetch that already happened', async () => {
    mockMusicBrainz({
      [DISCHARGE.id]: [
        memberRel(SHARED),
        derivedRel(TRIBUTE, 'tribute'),
        derivedRel(REUNION, 'subgroup'),
      ],
      [SHARED.id]: [bandRel(DISCHARGE)],
    });

    await walkLineup(DISCHARGE.id);

    expect(await count('artist_derived_acts')).toBe(2);
  });

  /**
   * Fails against a walk that spends a request per derived act. The whole value
   * of this signal is that it is FREE — the relations arrive on the band fetch
   * that the walk already makes, and a per-act request would make a 25-request
   * walk longer for data already in hand.
   */
  it('costs no extra MusicBrainz requests', async () => {
    const plain = mockMusicBrainz({
      [DISCHARGE.id]: [memberRel(SHARED)],
      [SHARED.id]: [bandRel(DISCHARGE)],
    });
    await walkLineup(DISCHARGE.id);
    const withoutDerived = plain.get.mock.calls.length;

    vi.restoreAllMocks();
    await truncateAll();

    const withActs = mockMusicBrainz({
      [DISCHARGE.id]: [
        memberRel(SHARED),
        derivedRel(TRIBUTE, 'tribute'),
        derivedRel(REUNION, 'subgroup'),
      ],
      [SHARED.id]: [bandRel(DISCHARGE)],
    });
    await walkLineup(DISCHARGE.id);

    expect(withActs.get.mock.calls.length).toBe(withoutDerived);
  });

  /**
   * Fails against a walk that records a derived act as a MEMBER. §4.3's table
   * holds person→group facts, and a band in it would inflate the very
   * shared-member count §9.1 reads — corrupting the signal this fix exists to
   * clean up.
   */
  it('does NOT add them to artist_memberships', async () => {
    mockMusicBrainz({
      [DISCHARGE.id]: [memberRel(SHARED), derivedRel(TRIBUTE, 'tribute')],
      [SHARED.id]: [bandRel(DISCHARGE)],
    });

    await walkLineup(DISCHARGE.id);

    // Only the one real member, not the tribute band.
    expect(await count('artist_memberships')).toBe(1);
  });

  it('is idempotent across a re-walk', async () => {
    const relations = {
      [DISCHARGE.id]: [memberRel(SHARED), derivedRel(TRIBUTE, 'tribute')],
      [SHARED.id]: [bandRel(DISCHARGE)],
    };
    mockMusicBrainz(relations);

    await walkLineup(DISCHARGE.id);
    await walkLineup(DISCHARGE.id);

    expect(await count('artist_derived_acts')).toBe(1);
  });
});

/**
 * SPEC.md §12 step 11 (A52, 2026-09-08) — a zero must say WHICH zero.
 *
 * **The silent-zero defect, named by Adam:** a walk that follows nobody and
 * reports success is "the app saying it did something it did not do". Three
 * different states currently render identically as `0 members.`:
 *
 *   1. a PERSON — `walkLineup` follows `role === 'person'` relations, and every
 *      relation on a Person is `role: 'group'`, so it follows nobody. Measured:
 *      Miles Davis has 11 groups and would report "0 members."
 *   2. a GROUP MusicBrainz has no lineup for — nothing to follow, honestly
 *   3. a group whose lineup was fetched and was genuinely empty
 *
 * **This is the same absent-versus-unknown shape as the progress count**, in the
 * same feature — which is Adam's point that fixing the walk without fixing what
 * it reports leaves the next silent case just as silent.
 */
describe('a zero says which zero it is (A52)', () => {
  const MILES = { id: 'mb-miles', name: 'Miles Davis' };
  const QUINTET = { id: 'mb-quintet', name: 'Miles Davis Quintet' };

  /**
   * Fails against the shipped text, which reports `0 members.` for a Person and
   * so cannot be told from a band with no lineup.
   */
  it('says a PERSON is not a band, rather than reporting zero members', async () => {
    mockMusicBrainz({
      // A Person's relations are all `forward` — the groups they were in.
      [MILES.id]: [bandRel(QUINTET)],
    });

    const result = await walkLineup(MILES.id);

    expect(result.text).not.toMatch(/^0 members/);
    expect(result.text).toMatch(/person|not a band|line-?up/i);
  });

  /**
   * Fails against a fix that reports every zero the same way. A group
   * MusicBrainz has no lineup for is a DIFFERENT fact from a person, and
   * collapsing them reintroduces the defect one level up.
   */
  it('distinguishes a group with no lineup from a person', async () => {
    mockMusicBrainz({ [DISCHARGE.id]: [] });

    const result = await walkLineup(DISCHARGE.id);

    expect(result.text).toMatch(/no line-?up|no members/i);
    expect(result.text).not.toMatch(/person/i);
  });

  /**
   * Fails against a walk that reports a Person as a successful zero-member
   * walk. `partial` is the field the UI reads to decide whether to offer a
   * retry, and a Person is neither complete nor interrupted — it is unhandled.
   */
  it('does not cache a Person as a completed walk', async () => {
    mockMusicBrainz({ [MILES.id]: [bandRel(QUINTET)] });

    await walkLineup(MILES.id);

    /*
     * Caching a Person would freeze the "we cannot walk this" answer for 90
     * days — so when the Person path IS built, a re-walk would read the cache
     * and do nothing. The same reasoning that stops a partial walk caching.
     */
    expect(await readCachedArtist(MILES.id)).toBeNull();
  });
});

/**
 * SPEC.md §12 step 11 (A54, 2026-09-08) — "N members" must be a count of PEOPLE.
 *
 * **The app stated something false, not merely imprecise.** MGMT's walk reported
 * "32 members." and MusicBrainz lists 32 member-of-band RELATIONS for seven
 * people — Will Berman appears 8 times, Andrew VanWyngarden 6 — because the API
 * records one relation per instrument per stint. A 4.5x overstatement, phrased
 * as a fact.
 *
 * **Third appearance of relations-versus-people.** It overstated Discharge's
 * `original` count 2.5x (10 relations, 4 people), it would have overstated the
 * shared-member score had the query counted rows, and now the completion text.
 * Same distinction, three layers, and it reads as a plausible number every time.
 */
describe('the completion text counts PEOPLE, not relations (A54)', () => {
  const BERMAN = { id: 'mb-berman', name: 'Will Berman' };

  /** One person, three instruments — three relations, one member. */
  function multiInstrument(person: { id: string; name: string }) {
    return ['drums (drum set)', 'percussion', 'guitar'].map((instrument) => ({
      type: 'member of band',
      direction: 'backward',
      'target-type': 'artist',
      attributes: [instrument],
      artist: { id: person.id, name: person.name, type: 'Person' },
    }));
  }

  /**
   * Fails against `total = members.length`, the shipped behaviour, which counts
   * the relation list and so reports 3 for one person.
   */
  it('reports one member for one person with three instrument credits', async () => {
    mockMusicBrainz({
      [DISCHARGE.id]: multiInstrument(BERMAN),
      [BERMAN.id]: [bandRel(DISCHARGE)],
    });

    const result = await walkLineup(DISCHARGE.id);

    expect(result.text).toBe('1 member.');
    expect(result.total).toBe(1);
  });

  /**
   * Fails against a fix that de-duplicates the TEXT but leaves `total` as a
   * relation count — the progress display reads `total`, so the two must agree
   * or the bar and the sentence disagree about the same walk.
   */
  it('counts two distinct people as two, not as their relation count', async () => {
    mockMusicBrainz({
      [DISCHARGE.id]: [...multiInstrument(BERMAN), ...multiInstrument(SHARED)],
      [BERMAN.id]: [bandRel(DISCHARGE)],
      [SHARED.id]: [bandRel(DISCHARGE)],
    });

    const result = await walkLineup(DISCHARGE.id);

    expect(result.total).toBe(2);
    expect(result.text).toBe('2 members.');
  });

  /**
   * Fails against a fix that also de-duplicates the FETCH loop incorrectly. A
   * person with three instrument rows must still be fetched once — the walk
   * already resolves per relation, and counting people must not change how many
   * requests are made.
   */
  it('does not refetch a person once per instrument', async () => {
    const mock = mockMusicBrainz({
      [DISCHARGE.id]: multiInstrument(BERMAN),
      [BERMAN.id]: [bandRel(DISCHARGE)],
    });

    await walkLineup(DISCHARGE.id);

    const bermanFetches = mock.requested.filter((id) => id === BERMAN.id).length;
    expect(bermanFetches, 'one person, one fetch').toBe(1);
  });
});

/**
 * A54, second half: `checked` and `total` must count the SAME thing.
 *
 * Fixing `total` alone leaves the partial message incoherent — `checked`
 * increments once per relation, so a band whose members hold several
 * instruments could report "Checked 12 of 7 members", which is worse than the
 * overstatement it replaced because it is visibly impossible.
 */
describe('a partial walk counts people on both sides (A54)', () => {
  it('never reports checking more members than exist', async () => {
    const p1 = { id: 'mb-p1', name: 'One' };
    const p2 = { id: 'mb-p2', name: 'Two' };
    const multi = (person: { id: string; name: string }) =>
      ['guitar', 'bass guitar', 'drums (drum set)'].map((instrument) => ({
        type: 'member of band',
        direction: 'backward',
        'target-type': 'artist',
        attributes: [instrument],
        artist: { id: person.id, name: person.name, type: 'Person' },
      }));

    // Fail after the band fetch plus one member, so the walk stops partway.
    mockMusicBrainz(
      {
        [DISCHARGE.id]: [...multi(p1), ...multi(p2)],
        [p1.id]: [bandRel(DISCHARGE)],
        [p2.id]: [bandRel(DISCHARGE)],
      },
      { failAfter: 2 },
    );

    const result = await walkLineup(DISCHARGE.id);

    expect(result.partial).toBe(true);
    expect(result.total).toBe(2);
    expect(result.checked).toBeLessThanOrEqual(result.total);
    /*
     * The sentence must agree with the fields. An earlier version of this
     * assertion used a regex intended to catch "checked > total" and matched
     * ANY "Checked N of M" — it would have failed the correct output, which is
     * the decorative-assertion shape in a test written minutes ago.
     */
    expect(result.text).toBe(
      `Checked ${result.checked} of ${result.total} members before MusicBrainz stopped responding. There may be more.`,
    );
  });
});
