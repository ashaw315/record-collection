import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, artistInfluences, artistMemberships, records, wantList } from '@/db/schema';
import { suggestions } from '@/lib/db/queries/suggestions';

/**
 * SPEC.md §9.1 as amended by A28 — the two SCORED terms, want-list suppression,
 * and the reason string.
 *
 * ```
 * score = (2.0 × owned artists directly linked, weighted by edge strength)
 *       + (1.5 × owned artists sharing members, weighted by people in common)
 *       - (3.0 if already on the want-list)
 * ```
 *
 * **No tests here assert that the genre or label terms return zero.** They are
 * unbuilt (§9.1a) and A28c is explicit: a test pinning an unsourced term to zero
 * passes for the wrong reason and keeps passing after a source arrives.
 */

const db = getTestDb();

beforeEach(async () => {
  await truncateAll();
});

afterAll(async () => {
  await closeTestDb();
});

async function makeArtist(name: string, id?: string) {
  const [row] = await db
    .insert(artists)
    .values(id === undefined ? { name } : { id, name })
    .returning();
  return row;
}

async function own(artistId: string, title: string) {
  await db.insert(records).values({ title, artistId });
}

async function influence(sourceId: string, targetId: string, strength: number) {
  await db
    .insert(artistInfluences)
    .values({ sourceArtistId: sourceId, targetArtistId: targetId, strength });
}

async function member(personId: string, groupId: string, instrument: string | null) {
  await db.insert(artistMemberships).values({
    personArtistId: personId,
    groupArtistId: groupId,
    instrument,
    beganYear: null,
    endedYear: null,
    musicbrainzId: null,
  });
}

/** A want-list row for an artist. §7.3: acquired rows are history, not wants. */
async function want(artistId: string, title: string, isAcquired = false) {
  await db.insert(wantList).values({ title, artistId, priority: 3, isAcquired });
}

const find = (rows: Awaited<ReturnType<typeof suggestions>>, id: string) =>
  rows.find((r) => r.artistId === id);

describe('the two scored terms', () => {
  /**
   * Fails against: a wrong influence coefficient in `scoreOf`.
   *
   * 2.0 × strength 4 = 8. Deliberately not 1 strength, which would make 2.0 and
   * a bare doubling indistinguishable from several other coefficients.
   */
  it('scores an influence-only candidate at 2.0 x summed strength', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Anti-Cimex');
    await own(owned.id, 'Why');
    await influence(candidate.id, owned.id, 4);

    const rows = await suggestions({ limit: 10 });

    expect(find(rows, candidate.id)?.score).toBe(8);
  });

  /**
   * Fails against: a wrong shared-member coefficient, and against merging the
   * two terms under the influence coefficient (which would give 4, not 3).
   */
  it('scores a shared-member-only candidate at 1.5 x people in common', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Broken Bones');
    await own(owned.id, 'Why');

    for (const name of ['Bones', 'Tezz']) {
      const person = await makeArtist(name);
      await member(person.id, owned.id, 'guitar');
      await member(person.id, candidate.id, 'guitar');
    }

    const rows = await suggestions({ limit: 10 });

    expect(find(rows, candidate.id)?.score).toBe(3);
  });

  /**
   * Fails against: any implementation where one term overwrites the other at
   * the SCORE level rather than the query level.
   *
   * Unit 1 proved both weights survive the query. This proves both reach the
   * score: 2.0×5 + 1.5×2 = 13. The two halves are distinguishable (10 and 3),
   * so dropping either gives a number this assertion rejects.
   */
  it('sums both terms for a candidate reached by both routes', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Broken Bones');
    await own(owned.id, 'Why');
    await influence(candidate.id, owned.id, 5);

    for (const name of ['Bones', 'Tezz']) {
      const person = await makeArtist(name);
      await member(person.id, owned.id, 'guitar');
      await member(person.id, candidate.id, 'guitar');
    }

    const rows = await suggestions({ limit: 10 });

    expect(find(rows, candidate.id)?.score).toBe(13);
  });

  /**
   * Fails against: `COUNT(DISTINCT linking artist)` replaced by a boolean or by
   * a count of EDGES rather than of artists.
   *
   * §9.1's reason string asserts a NUMBER — "Linked to 3 artists you own" — and
   * a fixture with one linking artist per candidate cannot tell a count from a
   * flag. Mutation-verified in both respects: see the fixture note below.
   */
  it('counts the owned artists linking to a candidate, not merely that some do', async () => {
    const first = await makeArtist('Discharge');
    const second = await makeArtist('The Varukers');
    const candidate = await makeArtist('Anti-Cimex');
    await own(first.id, 'Why');
    await own(second.id, 'Bloodsuckers');

    /*
     * Edges in BOTH directions between the candidate and `first`, plus one to
     * `second`. Three edges, TWO owned artists.
     *
     * The two-artists-one-edge-each version of this test does not constrain the
     * count: measured, a mutation replacing COUNT(DISTINCT artist) with a count
     * of EDGES passed all 15 tests, because edge count and artist count agree
     * whenever every artist contributes exactly one edge. §4.3's PK is
     * (source, target), so a second edge to the same artist requires the
     * opposite direction — which §9.1 already counts, since it does not care
     * which way the influence runs.
     */
    await influence(candidate.id, first.id, 2);
    await influence(first.id, candidate.id, 1);
    await influence(candidate.id, second.id, 3);

    const rows = await suggestions({ limit: 10 });
    const got = find(rows, candidate.id);

    expect(got?.influenceArtistCount).toBe(2);
    expect(got?.score).toBe(12); // 2.0 × (2 + 1 + 3)
  });

  /**
   * Fails against: counting membership ROWS as artists.
   *
   * One owned band, one shared person holding two instruments — two membership
   * rows on each side. The band count is 1 and the people count is 1; an
   * implementation counting rows reports 2 for either and this rejects it.
   */
  it('counts sharing bands and shared people, never membership rows', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Broken Bones');
    const person = await makeArtist('Bones');
    await own(owned.id, 'Why');

    await member(person.id, owned.id, 'guitar');
    await member(person.id, owned.id, 'keyboards');
    await member(person.id, candidate.id, 'guitar');
    await member(person.id, candidate.id, 'keyboards');

    const rows = await suggestions({ limit: 10 });
    const got = find(rows, candidate.id);

    expect(got?.sharedMemberArtistCount).toBe(1);
    expect(got?.sharedMemberWeight).toBe(1);
    expect(got?.score).toBe(1.5);
  });
});

describe('want-list suppression is suppression, not exclusion', () => {
  /**
   * Fails against: `WHERE NOT EXISTS (want_list ...)` — the candidate would
   * vanish — and against a suppression constant other than 3.0.
   *
   * **Constructed so the suppressed candidate STAYS VISIBLE.** §9.1 says
   * "suppress, don't hide", and a fixture where suppression happens to push the
   * candidate past `limit` cannot tell the two apart: both produce an absent
   * row. Score here is 2.0×6 = 12, less 3.0 = 9, still the only candidate and
   * far inside the limit.
   */
  it('keeps a want-listed candidate visible with its score reduced by exactly 3.0', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Anti-Cimex');
    await own(owned.id, 'Why');
    await influence(candidate.id, owned.id, 6);
    await want(candidate.id, 'Raped Ass');

    const rows = await suggestions({ limit: 10 });
    const got = find(rows, candidate.id);

    expect(got).toBeDefined();
    expect(got?.score).toBe(9);
    expect(got?.onWantList).toBe(true);
  });

  /**
   * Fails against: suppression applied AFTER the sort.
   *
   * The test above cannot catch that — the score would still be 9 and the row
   * still present, only in the wrong position. Here suppression must FLIP the
   * order: unsuppressed Anti-Cimex scores 2.0×5 = 10; The Varukers scores
   * 2.0×6 = 12 less 3.0 = 9. Sorting before subtracting puts The Varukers
   * first, which this rejects.
   */
  it('suppression changes rank, not just the number reported', async () => {
    const owned = await makeArtist('Discharge');
    await own(owned.id, 'Why');

    const plain = await makeArtist('Anti-Cimex');
    const wanted = await makeArtist('The Varukers');
    await influence(plain.id, owned.id, 5);
    await influence(wanted.id, owned.id, 6);
    await want(wanted.id, 'Bloodsuckers');

    const rows = await suggestions({ limit: 10 });

    expect(rows.map((r) => r.artistName)).toEqual(['Anti-Cimex', 'The Varukers']);
    expect(rows[0].score).toBe(10);
    expect(rows[1].score).toBe(9);
  });

  /**
   * Fails against: a suppression join that ignores `is_acquired`.
   *
   * §7.3: acquiring never deletes the want-list row, it marks it acquired, so
   * the table doubles as acquisition history. An acquired row is not a current
   * want and must not suppress — otherwise every past purchase permanently
   * penalises the artist that made it.
   */
  it('an acquired want-list row does not suppress', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Anti-Cimex');
    await own(owned.id, 'Why');
    await influence(candidate.id, owned.id, 6);
    await want(candidate.id, 'Raped Ass', true);

    const rows = await suggestions({ limit: 10 });
    const got = find(rows, candidate.id);

    expect(got?.score).toBe(12);
    expect(got?.onWantList).toBe(false);
  });
});

describe('the reason string is a list of clauses', () => {
  /**
   * Fails against: a scalar `reason`, or a pre-joined sentence, or a list that
   * keeps only the first clause.
   *
   * NOTES' field-holding-a-list rule, third recorded instance and counting: the
   * singular case is the common one, so a design that holds one clause looks
   * correct until a candidate is reached both ways. §9.1 requires the two link
   * terms to appear as SEPARATE clauses naming which fired.
   */
  it('returns one clause per contributing term, not a single merged reason', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Broken Bones');
    await own(owned.id, 'Why');
    await influence(candidate.id, owned.id, 5);

    for (const name of ['Bones', 'Tezz']) {
      const person = await makeArtist(name);
      await member(person.id, owned.id, 'guitar');
      await member(person.id, candidate.id, 'guitar');
    }

    const rows = await suggestions({ limit: 10 });
    const got = find(rows, candidate.id);

    expect(got?.reasons).toHaveLength(2);
    expect(got?.reasons[0]).toMatch(/linked to 1 artist you own/i);
    expect(got?.reasons[1]).toMatch(/shares 2 members with Discharge/i);
  });

  /**
   * Fails against: a clause that omits the count, or names the wrong artist.
   *
   * "shares 4 members with Discharge" is §9.1's own example and it carries two
   * facts a reader checks: how many, and with whom. A clause reading "shares
   * members" would satisfy a length assertion and tell the user nothing.
   */
  it('names the count and the owned artist in the shared-member clause', async () => {
    const owned = await makeArtist('Dire Straits');
    const candidate = await makeArtist('Notting Hillbillies');
    await own(owned.id, 'Brothers in Arms');

    for (const name of ['Mark Knopfler', 'Guy Fletcher', 'Ed Bicknell', 'Steve Phillips']) {
      const person = await makeArtist(name);
      await member(person.id, owned.id, 'guitar');
      await member(person.id, candidate.id, 'guitar');
    }

    const rows = await suggestions({ limit: 10 });

    expect(find(rows, candidate.id)?.reasons).toEqual([
      'Shares 4 members with Dire Straits',
    ]);
  });

  /**
   * Fails against: suppression that reduces the score silently.
   *
   * §9.1: "Suggestions must be explainable. Never return a bare score with no
   * reasoning." A candidate scoring 9 where the arithmetic says 12 is exactly a
   * bare number unless something says why.
   */
  it('says the candidate is on the want list when suppression applied', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Anti-Cimex');
    await own(owned.id, 'Why');
    await influence(candidate.id, owned.id, 6);
    await want(candidate.id, 'Raped Ass');

    const rows = await suggestions({ limit: 10 });

    expect(find(rows, candidate.id)?.reasons.join(' ')).toMatch(/already on your want list/i);
  });
});

describe('ordering and limit', () => {
  /**
   * Fails against: a missing ORDER BY score, or a limit applied before sorting.
   */
  it('returns the highest scores first, cut to limit', async () => {
    const owned = await makeArtist('Discharge');
    await own(owned.id, 'Why');

    for (const [name, strength] of [
      ['Low', 1],
      ['High', 5],
      ['Middle', 3],
    ] as const) {
      const candidate = await makeArtist(name);
      await influence(candidate.id, owned.id, strength);
    }

    const rows = await suggestions({ limit: 2 });

    expect(rows.map((r) => r.artistName)).toEqual(['High', 'Middle']);
  });

  /**
   * Fails against: a missing or non-total tie-break.
   *
   * Uuids are PINNED so id order reverses name order — unit 1 measured that
   * random uuids agree with alphabetical order about half the time, so the
   * obvious version of this test catches its mutation 1 run in 5, which is
   * worse than not having it.
   */
  it('breaks equal scores on artist name', async () => {
    const owned = await makeArtist('Discharge');
    await own(owned.id, 'Why');

    const zeta = await makeArtist('Zeta Band', '00000000-0000-4000-8000-000000000001');
    const alpha = await makeArtist('Alpha Band', '00000000-0000-4000-8000-000000000002');
    await influence(zeta.id, owned.id, 3);
    await influence(alpha.id, owned.id, 3);

    const rows = await suggestions({ limit: 10 });

    expect(rows.map((r) => r.artistName)).toEqual(['Alpha Band', 'Zeta Band']);
  });
});

describe('the empty collection', () => {
  /**
   * Fails against: an implementation that throws, returns null, or returns a
   * sentinel row when nothing is linked.
   *
   * **This is the REALISTIC case, not the edge case.** `artist_influences` is
   * hand-entered and currently holds nothing, so the shared-member route carries
   * §9.1 alone — and a collection whose artists have had no lineup walk has
   * neither. The UI must distinguish "nothing suggested" from "the engine did
   * not run", and an empty ARRAY is what makes that possible: a thrown error or
   * a null would collapse the two.
   */
  it('returns an empty array when nothing links to the collection', async () => {
    const owned = await makeArtist('Discharge');
    await own(owned.id, 'Why');

    const rows = await suggestions({ limit: 10 });

    expect(rows).toEqual([]);
  });

  /**
   * Fails against: a query that returns candidates from an empty collection.
   *
   * With no records at all, nothing is owned, so nothing is reachable FROM the
   * collection — even though artists and edges exist. An implementation that
   * treated "no owned artists" as "no exclusions" would return every artist in
   * the database as a suggestion.
   */
  it('suggests nothing when the collection itself is empty', async () => {
    const a = await makeArtist('Discharge');
    const b = await makeArtist('Anti-Cimex');
    await influence(b.id, a.id, 5);

    const rows = await suggestions({ limit: 10 });

    expect(rows).toEqual([]);
  });
});
