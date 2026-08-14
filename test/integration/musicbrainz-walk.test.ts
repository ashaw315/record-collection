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
