import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeRelations } from './normalize-relations';

/**
 * SPEC.md §12 step 11 and §4.3's `artist_memberships`.
 *
 * **The fixtures are real payloads, captured live** (rate-limited at 1.2s), for
 * the reason step 7's were: a normalizer designed against an imagined shape
 * fails on the first real response, and MusicBrainz's relation objects carry
 * fifteen keys of which we want five.
 *
 * **Black Flag is the discriminating fixture.** Discharge and Minor Threat are
 * 100% `member of band` — against those, a normalizer that filtered nothing at
 * all would pass every test. Black Flag carries five relation types (22 member,
 * plus collaboration, founder, subgroup, tribute), so the filter has something
 * to discard and the tests can prove it does.
 */

const fixture = (name: string) =>
  JSON.parse(readFileSync(`test/fixtures/musicbrainz/${name}.json`, 'utf8')) as {
    relations?: unknown[];
  };

const BLACK_FLAG = fixture('artist-black-flag');
const DISCHARGE = fixture('artist-discharge');
const PERSON = fixture('artist-person-tony-atkinson');

/**
 * **The divergent fixture**, and the reason it exists.
 *
 * A mutation deriving `role` from the target's Person/Group type instead of
 * `direction` passed every test in this file — because in Discharge, Black Flag
 * and the person fixture the two rules NEVER disagree: bands have Person
 * members, people have Group bands.
 *
 * The Wu-Tang Killa Bees have GP Wu — a **Group** that is a member of a group,
 * `direction: backward`. Real MusicBrainz data, not constructed. Here the rules
 * diverge: `direction` says "this is a member", the target type says "this is a
 * band". Only the first is right.
 */
const GROUP_MEMBER = fixture('artist-group-member-of-group');
const GP_WU_MBID = '4b771ae9-bd02-49ea-a46d-88d684e17a88';

describe('which relations are kept', () => {
  it('keeps member-of-band and discards every other type', () => {
    /**
     * The load-bearing filter test, and it needs Black Flag: 26 relations in,
     * 22 out, with collaboration / founder / subgroup / tribute dropped.
     *
     * §4.3 is explicit that membership is a fact with a source and influence is
     * the user's judgement. `founder` and `subgroup` are tempting — they ARE
     * relationships between artists — but "founded" and "is a subgroup of" are
     * not membership, and inventing a membership row from one would record a
     * fact nobody asserted.
     */
    const kept = normalizeRelations(BLACK_FLAG.relations);

    expect(kept).toHaveLength(22);
    expect(BLACK_FLAG.relations, 'the fixture really does carry others').toHaveLength(26);
  });

  it('discards a collaboration, which is not membership', () => {
    // Black Flag ↔ Minuteflag. A short-term project between artists, and
    // recording it as "was a member of" would be false.
    const names = normalizeRelations(BLACK_FLAG.relations).map((m) => m.artistName);

    expect(names).not.toContain('Minuteflag');
  });

  it('discards founder, subgroup and tribute', () => {
    const names = normalizeRelations(BLACK_FLAG.relations).map((m) => m.artistName);

    // Greg Ginn IS a member too, via a separate member-of-band relation — so
    // this asserts the FOUNDER relation was dropped, not that he is absent.
    expect(names, 'FLAG is a subgroup, not a member').not.toContain('FLAG');
    expect(names, 'Black Fag is a tribute act').not.toContain('Black Fag');
  });

  it('returns nothing for an artist with no relations at all', () => {
    // Absent is not an error, and must not become one.
    expect(normalizeRelations(undefined)).toEqual([]);
    expect(normalizeRelations([])).toEqual([]);
  });
});

describe('direction — who is the person and who is the band', () => {
  /**
   * **The field that decides which column a row lands in.** `member of band`
   * links a person to a group, and the SAME relation reads `backward` when
   * fetched from the band and `forward` when fetched from the person. Getting
   * this wrong silently inverts every membership row: bands recorded as members
   * of people.
   */

  it('reads a band’s relation as pointing at its members', () => {
    const kept = normalizeRelations(DISCHARGE.relations);

    expect(kept.length).toBeGreaterThan(0);
    for (const membership of kept) {
      expect(membership.role, 'from a band, the other artist is the person').toBe('person');
    }
  });

  it('reads a person’s relation as pointing at their band', () => {
    const kept = normalizeRelations(PERSON.relations);

    expect(kept).toHaveLength(1);
    expect(kept[0].role, 'from a person, the other artist is the group').toBe('group');
    expect(kept[0].artistName).toBe('Discharge');
  });

  it('does not decide direction by the target’s Person/Group type', () => {
    /**
     * **The discriminating case, from real data.** GP Wu is a Group that is a
     * MEMBER of the Wu-Tang Killa Bees — `direction: backward`, target type
     * `Group`. The two candidate rules disagree here and nowhere else in these
     * fixtures:
     *
     *   by direction   -> role 'person' (correct: it is a member)
     *   by target type -> role 'group'  (wrong: it would invert the row)
     *
     * Without this the shortcut passes everything, which a mutation proved.
     */
    const kept = normalizeRelations(GROUP_MEMBER.relations);
    const gpWu = kept.find((m) => m.artistMbid === GP_WU_MBID);

    expect(gpWu, 'the divergent relation survived the filter').toBeDefined();
    expect(gpWu?.artistType, 'MusicBrainz really does call it a Group').toBe('Group');
    expect(gpWu?.role, 'and it is still a MEMBER of the Killa Bees').toBe('person');
  });

  it('reads a person’s band as a group even though the target is a Group', () => {
    // The other side of the same distinction: forward direction, Group target.
    const [membership] = normalizeRelations(PERSON.relations);

    expect(membership.artistType).toBe('Group');
    expect(membership.role).toBe('group');
  });
});

describe('the fields a membership row needs (§4.3)', () => {
  it('carries the MusicBrainz id of the other artist', () => {
    /**
     * §4.3 stores `musicbrainz_id`, and unit 4 resolves artists BY it. Names are
     * not a reliable key — two artists sharing a name are not the same artist,
     * which is §7.7's hazard in a new place.
     */
    const [membership] = normalizeRelations(PERSON.relations);

    expect(membership.artistMbid).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });

  it('carries the instrument, ignoring non-instrument attributes', () => {
    /**
     * `attributes` mixes instruments with qualifiers — "original" appears
     * beside "drums (drum set)". Storing "original" as an instrument would put
     * a word that is not an instrument into a column named for one, and §4.3
     * has instrument in the PRIMARY KEY, so it decides row identity.
     */
    const kept = normalizeRelations(DISCHARGE.relations);
    const instruments = kept.map((m) => m.instrument);

    expect(instruments, 'a real instrument survives').toContain('drums (drum set)');
    expect(instruments, 'the qualifier does not').not.toContain('original');
  });

  it('leaves the instrument null when only qualifiers are present', () => {
    // Absent, not the empty string — §4.3 makes the column nullable and null is
    // what "not recorded" means everywhere else in this schema.
    const kept = normalizeRelations([
      {
        type: 'member of band',
        direction: 'backward',
        'target-type': 'artist',
        attributes: ['original'],
        artist: { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', name: 'Someone', type: 'Person' },
      },
    ]);

    expect(kept[0].instrument).toBeNull();
  });
});

describe('dates — three formats appear in real payloads', () => {
  /**
   * Measured across the captured fixtures: `1976`, `2014-03` and `2011-12-13`
   * all occur. §4.3 stores an INTEGER year, so each must reduce to one — and
   * `Number('2011-12-13')` is `NaN`, which is the coercion class from NOTES in
   * a new place. A NaN written to an integer column is a write that fails at
   * the database, far from the parse that caused it.
   */

  it('reads a bare year', () => {
    const kept = normalizeRelations([
      relationWith({ begin: '1976', end: '1986' }),
    ]);

    expect(kept[0].beganYear).toBe(1976);
    expect(kept[0].endedYear).toBe(1986);
  });

  it('reads a year-month and a full date as their year', () => {
    const kept = normalizeRelations([
      relationWith({ begin: '2014-03', end: '2011-12-13' }),
    ]);

    expect(kept[0].beganYear).toBe(2014);
    expect(kept[0].endedYear, 'never NaN').toBe(2011);
  });

  it('leaves a missing date null rather than zero', () => {
    /**
     * Six Black Flag members have no end date and two have no begin date — an
     * ongoing or unrecorded membership is normal. Zero would render as the year
     * 0 and sort before everything.
     */
    const kept = normalizeRelations([relationWith({})]);

    expect(kept[0].beganYear).toBeNull();
    expect(kept[0].endedYear).toBeNull();
  });

  it('rejects a junk date rather than storing NaN', () => {
    const kept = normalizeRelations([relationWith({ begin: 'sometime', end: '' })]);

    expect(kept[0].beganYear).toBeNull();
    expect(kept[0].endedYear).toBeNull();
  });

  it('reads real dates from the real fixture without producing NaN', () => {
    // The property, asserted across every row rather than at one point — a
    // single NaN in 22 rows would otherwise pass unnoticed.
    for (const membership of normalizeRelations(BLACK_FLAG.relations)) {
      for (const year of [membership.beganYear, membership.endedYear]) {
        if (year !== null) expect(Number.isInteger(year), `${year} is a year`).toBe(true);
      }
    }
  });
});

describe('malformed input is skipped, not thrown on', () => {
  it('skips a relation with no artist id', () => {
    /**
     * MusicBrainz data is user-submitted. One unusable relation in a 31-row
     * payload must not lose the other thirty — the same reasoning §6 applies to
     * Discogs.
     */
    const kept = normalizeRelations([
      { type: 'member of band', direction: 'backward', artist: { name: 'No Id' } },
      relationWith({ begin: '1980' }),
    ]);

    expect(kept).toHaveLength(1);
    expect(kept[0].beganYear).toBe(1980);
  });

  it('skips a relation whose target is not an artist', () => {
    const kept = normalizeRelations([
      {
        type: 'member of band',
        direction: 'backward',
        'target-type': 'place',
        artist: { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', name: 'Somewhere' },
      },
    ]);

    expect(kept).toEqual([]);
  });

  it('does not throw on entirely unexpected input', () => {
    expect(() => normalizeRelations([null, 42, 'nonsense', {}])).not.toThrow();
    expect(normalizeRelations([null, 42, 'nonsense', {}])).toEqual([]);
  });
});

/** A minimal `member of band` relation, for the cases real fixtures cannot express. */
function relationWith(overrides: Record<string, unknown>) {
  return {
    type: 'member of band',
    direction: 'backward',
    'target-type': 'artist',
    attributes: ['guitar'],
    artist: { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', name: 'Someone', type: 'Person' },
    ...overrides,
  };
}
