import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { getTestDb, truncateAll, closeTestDb } from '../helpers/db';
import { artists, artistInfluences, artistMemberships, records } from '@/db/schema';
import { linkTermsForCandidates } from '@/lib/db/queries/suggestions';

/**
 * SPEC.md §9.1's two link terms, as amended by A27.
 *
 * **The terms are separate and must stay separate.** An `artist_influences`
 * edge carries a 1-5 `strength` the user typed; a shared membership carries a
 * count of people imported from MusicBrainz. §4.3 forbids writing membership
 * into `artist_influences`; A27 forbids scoring them as one term, which is the
 * same conflation one layer up. These tests are shaped around that: every one
 * of them fails against an implementation that merges the two.
 *
 * **A candidate is an artist NOT in the collection**, reached from one that is.
 * `records.artist_id` is NOT NULL (verified against the test database, not read
 * from the deleted `graph.ts`, which guarded a nullability that no longer
 * exists), so "owned" means simply: has at least one row in `records`.
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

/** An artist becomes "owned" by having a record. */
async function own(artistId: string, title: string) {
  await db.insert(records).values({ title, artistId });
}

async function influence(sourceId: string, targetId: string, strength: number) {
  await db.insert(artistInfluences).values({
    sourceArtistId: sourceId,
    targetArtistId: targetId,
    strength,
  });
}

/**
 * One person in one group. `instrument` distinguishes two rows for the same
 * pair, which is what §4.3's identity triple is for.
 */
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

const byId = (rows: Awaited<ReturnType<typeof linkTermsForCandidates>>, id: string) =>
  rows.find((r) => r.artistId === id);

describe('reachability by one route only', () => {
  /**
   * Fails against: the shared-member branch of `linkTermsForCandidates` if it
   * reports absence instead of 0, and against any implementation that requires
   * BOTH routes before emitting a candidate.
   *
   * §11 (as amended by A27) requires the single-route cases explicitly: a
   * fixture carrying both routes cannot separate a correct implementation from
   * one that merged them.
   */
  it('an artist reached by an influence edge alone scores the influence term only', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Anti-Cimex');
    await own(owned.id, 'Hear Nothing See Nothing Say Nothing');
    await influence(candidate.id, owned.id, 4);

    const rows = await linkTermsForCandidates();
    const got = byId(rows, candidate.id);

    expect(got).toBeDefined();
    expect(got?.influenceWeight).toBe(4);
    expect(got?.sharedMemberWeight).toBe(0);
  });

  /**
   * Fails against: the influence branch if it reports absence instead of 0, and
   * against an implementation that only reaches candidates through
   * `artist_influences` — which is what §9.1's scoring block specified before
   * A27, and would leave this artist unreachable entirely.
   */
  it('an artist reached by shared membership alone scores the shared-member term only', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Broken Bones');
    const person = await makeArtist('Bones');
    await own(owned.id, 'Why');
    await member(person.id, owned.id, 'guitar');
    await member(person.id, candidate.id, 'guitar');

    const rows = await linkTermsForCandidates();
    const got = byId(rows, candidate.id);

    expect(got).toBeDefined();
    expect(got?.sharedMemberWeight).toBe(1);
    expect(got?.influenceWeight).toBe(0);
  });
});

describe('the two terms are independent', () => {
  /**
   * Fails against: any implementation where one route's write overwrites the
   * other's when they coincide — a single `SELECT` per candidate, a `Map.set`
   * keyed on artist id, a `UNION` that collapses two rows into one, or a
   * merged single term.
   *
   * **Cases 1 and 2 cannot catch this.** In each of them the other route is the
   * only writer, so an overwrite is invisible: the surviving value is the
   * correct one by default. Only a candidate reached BOTH ways can distinguish
   * "computed both" from "computed both, then kept one".
   *
   * This is the field-holding-a-list shape NOTES records three times (the
   * version-table badge, `artist_match_candidates`, `resolveArtist`'s return).
   * It is silent every time: no error, the extra value simply does not exist
   * downstream, and the singular case is the common one so it looks correct.
   *
   * The two weights are deliberately DIFFERENT numbers (5 and 2). Equal values
   * would let an overwrite pass, since either survivor would match.
   */
  it('an artist reached by both routes carries both weights, neither overwriting the other', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Broken Bones');
    await own(owned.id, 'Why');

    await influence(candidate.id, owned.id, 5);

    for (const [name, instrument] of [
      ['Bones', 'guitar'],
      ['Tezz', 'drums'],
    ] as const) {
      const person = await makeArtist(name);
      await member(person.id, owned.id, instrument);
      await member(person.id, candidate.id, instrument);
    }

    const rows = await linkTermsForCandidates();
    const got = byId(rows, candidate.id);

    expect(got).toBeDefined();
    expect(got?.influenceWeight).toBe(5);
    expect(got?.sharedMemberWeight).toBe(2);
  });
});

describe('the influence weight sums every edge to the collection', () => {
  /*
   * Was a throwaway psql probe, committed per CLAUDE.md §2: the probe is what
   * convinced me the LATERAL/CASE picks the correct endpoint, and verification
   * that does not survive the session did not happen.
   *
   * Fails against: a CASE that picks the wrong end of the edge, and against any
   * implementation returning one row per edge instead of one per candidate
   * (which would report 3 or 2, never 5).
   *
   * §4.3's edge is DIRECTED and §9.1 does not care which way it runs — an artist
   * who influenced a band the user collects is as worth suggesting as one they
   * influenced. So one edge points from the candidate and one toward it, and
   * both must count. The strengths differ (3 and 2) so no pair of them sums to
   * the same total by accident.
   */
  it('sums edges in both directions across several owned artists', async () => {
    const ownedA = await makeArtist('Owned A');
    const ownedB = await makeArtist('Owned B');
    const candidate = await makeArtist('Anti-Cimex');
    await own(ownedA.id, 'ra');
    await own(ownedB.id, 'rb');

    await influence(candidate.id, ownedA.id, 3);
    await influence(ownedB.id, candidate.id, 2);

    const rows = await linkTermsForCandidates();

    expect(byId(rows, candidate.id)?.influenceWeight).toBe(5);
  });
});

describe('the shared-member weight is a count of people', () => {
  /**
   * Fails against: a `sharedMemberWeight` that is boolean/1 rather than a count
   * — the exact mutation A27 forbids, since it dissolves the one comparison
   * this data answers.
   *
   * Measured, not invented: NOTES recorded after the first live lineup walks
   * that Dire Straits Experience shares ONE member with Dire Straits, where a
   * genuine side project shares several. §4.3: "a tribute act overlaps by one
   * hired player, a genuine side project by several, and that difference is the
   * signal."
   */
  it('a side project sharing four members outscores a tribute act sharing one', async () => {
    const owned = await makeArtist('Dire Straits');
    const tribute = await makeArtist('Dire Straits Experience');
    const sideProject = await makeArtist('Notting Hillbillies');
    await own(owned.id, 'Brothers in Arms');

    const hiredPlayer = await makeArtist('Chris White');
    await member(hiredPlayer.id, owned.id, 'saxophone');
    await member(hiredPlayer.id, tribute.id, 'saxophone');

    for (const name of ['Mark Knopfler', 'Guy Fletcher', 'Ed Bicknell', 'Steve Phillips']) {
      const person = await makeArtist(name);
      await member(person.id, owned.id, 'guitar');
      await member(person.id, sideProject.id, 'guitar');
    }

    const rows = await linkTermsForCandidates();

    expect(byId(rows, tribute.id)?.sharedMemberWeight).toBe(1);
    expect(byId(rows, sideProject.id)?.sharedMemberWeight).toBe(4);
  });

  /**
   * Fails against: `COUNT(*)` in place of `COUNT(DISTINCT person_artist_id)`.
   *
   * §4.3 identifies a membership by (person, group, instrument), so one player
   * holding both keyboards and guitar in a band is TWO rows and ONE person. The
   * deleted `graph.ts` carried this rule and its reasoning; it is re-derived
   * here against §9.1's requirement rather than restored, since that builder was
   * shaped for a force-directed layout.
   *
   * Without this test, `COUNT(*)` would report 2 and make a single multi-
   * instrumentalist look exactly like a genuine two-member overlap — the tribute
   * and the side project confused again, by a different mechanism.
   */
  it('one person on two instruments counts once, not twice', async () => {
    const owned = await makeArtist('Discharge');
    const candidate = await makeArtist('Broken Bones');
    const person = await makeArtist('Bones');
    await own(owned.id, 'Why');

    await member(person.id, owned.id, 'guitar');
    await member(person.id, owned.id, 'keyboards');
    await member(person.id, candidate.id, 'guitar');
    await member(person.id, candidate.id, 'keyboards');

    const rows = await linkTermsForCandidates();

    expect(byId(rows, candidate.id)?.sharedMemberWeight).toBe(1);
  });
});

describe('the candidate set', () => {
  /**
   * Fails against: a query missing the `NOT EXISTS (SELECT 1 FROM records ...)`
   * exclusion.
   *
   * §9.1 says "for each artist NOT in the collection". An owned artist reached
   * from another owned artist satisfies every reachability condition and must
   * still be excluded — suggesting a record the user already owns is the
   * clearest way for this feature to look broken.
   */
  it('an owned artist is never its own candidate, even when reachable from another', async () => {
    const first = await makeArtist('Discharge');
    const second = await makeArtist('Broken Bones');
    await own(first.id, 'Why');
    await own(second.id, 'Dem Bones');

    await influence(second.id, first.id, 3);
    const person = await makeArtist('Bones');
    await member(person.id, first.id, 'guitar');
    await member(person.id, second.id, 'guitar');

    // POSITIVE CONTROL. Without a candidate that MUST appear, this test passes
    // against an implementation that returns nothing at all — "everything is
    // excluded" satisfies an exclusion assertion vacuously. Observed: both
    // exclusion tests passed against a stub returning [].
    const candidate = await makeArtist('Anti-Cimex');
    await influence(candidate.id, first.id, 2);

    const rows = await linkTermsForCandidates();

    expect(byId(rows, candidate.id)).toBeDefined();
    expect(byId(rows, first.id)).toBeUndefined();
    expect(byId(rows, second.id)).toBeUndefined();
  });

  /**
   * Fails against: a reachability condition that does not anchor on ownership —
   * e.g. one that emits every artist carrying any influence edge or membership
   * at all, regardless of whether the other end is owned.
   *
   * Two unowned artists linked to each other are not reachable FROM the
   * collection, and a suggestion engine that surfaced them would be recommending
   * from data that says nothing about what the user collects.
   */
  it('an artist linked only to other unowned artists is not a candidate', async () => {
    const owned = await makeArtist('Discharge');
    await own(owned.id, 'Why');

    const strangerA = await makeArtist('Some Band');
    const strangerB = await makeArtist('Another Band');
    await influence(strangerA.id, strangerB.id, 5);
    const person = await makeArtist('Session Player');
    await member(person.id, strangerA.id, 'bass');
    await member(person.id, strangerB.id, 'bass');

    // POSITIVE CONTROL, for the reason given in the test above: an exclusion
    // assertion alone cannot tell "correctly excluded" from "returned nothing".
    const candidate = await makeArtist('Anti-Cimex');
    await influence(candidate.id, owned.id, 2);

    const rows = await linkTermsForCandidates();

    expect(byId(rows, candidate.id)).toBeDefined();
    expect(byId(rows, strangerA.id)).toBeUndefined();
    expect(byId(rows, strangerB.id)).toBeUndefined();
  });
});

describe('determinism', () => {
  /**
   * Fails against: a missing or non-total `ORDER BY`.
   *
   * A27 requires ties to break on artist name so the same collection scores the
   * same way on every call — §8.2's determinism rule, which outlived the feature
   * it was written for. Two candidates with IDENTICAL weights are the only case
   * that can distinguish an ordered result from an unordered one; distinct
   * weights would be separated by the weight sort whatever the tie-break did.
   *
   * Mutation-verified: removing the name tie-break (`ORDER BY a.id` alone)
   * fails this test on 5 runs of 5. See the pinned uuids below for why that
   * required work — the obvious version of this test caught it 1 run in 5.
   */
  it('candidates with equal weights are ordered by artist name', async () => {
    const owned = await makeArtist('Discharge');
    await own(owned.id, 'Why');

    /*
     * **The uuids are PINNED so that id order is the reverse of name order.**
     *
     * Measured, not assumed: with random uuids this test passed 4 runs in 5
     * against `ORDER BY a.id` — the mutation that removes the name tie-break —
     * because random ids agree with alphabetical order about half the time per
     * pair. A test that catches a defect one run in five is worse than no test,
     * because it presents as a flake and gets retried away. NOTES records the
     * same shape at unit 12b: "ordering by uuid makes a test a coin flip".
     *
     * Alpha sorts FIRST by name and LAST by id, so the two orders cannot agree
     * and the assertion can only pass if the name tie-break is what ordered it.
     */
    const zeta = await makeArtist('Zeta Band', '00000000-0000-4000-8000-000000000001');
    const alpha = await makeArtist('Alpha Band', '00000000-0000-4000-8000-000000000002');
    await influence(zeta.id, owned.id, 3);
    await influence(alpha.id, owned.id, 3);

    const rows = await linkTermsForCandidates();
    const names = rows.map((r) => r.artistName);

    expect(names).toEqual(['Alpha Band', 'Zeta Band']);
  });
});
