import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { comparisonKey, groupIdenticalVersions, mustStayExpanded } from './identical-versions';
import { normalizeVersion, type NormalizedVersion } from '@/lib/discogs/normalize-versions';

/**
 * Collapsing versions that render as the same row (SPEC.md §5.7).
 *
 * §5.7 calls the version table "the step where the user identifies THEIR
 * pressing". Master 133514 (Hot Tuna) carries US 1970 versions that are
 * identical on every field the versions endpoint returns:
 *
 *   LSP-4353 | US | 1970 | LP, Album, Stereo | RCA Victor
 *
 * No column can separate them: `format.text` — which carries "Rockaway
 * Pressing" — exists on the RELEASE endpoint and not on versions, whose keys are
 * id, label, country, title, major_formats, format, catno, released, status,
 * resource_url, thumb, stats.
 *
 * **Rendering them as identical rows is worse than a longer table: it looks
 * like an answer.** A user picked one, believed they had another, and reported
 * the pressing plant as wrong — it was correct for the release they actually
 * had. So identical rows collapse into one that SAYS they are indistinguishable
 * from here.
 *
 * **The captured payload is loaded below, and it corrected this docblock.** The
 * text said FIVE identical versions "measured against the live API"; the
 * committed capture of that master has THREE, plus a fourth differing only by
 * `Repress`. The hand-built `BASE` used ids taken out of that fixture while the
 * fixture itself was loaded by nothing, so the number could drift from the
 * evidence without anything failing — which is what the fixture README warns
 * about: "a hand-written fixture encodes what we EXPECT the API to return."
 *
 * The unit tests below stay hand-built, deliberately: they probe rules the real
 * payload has no example of (a genuine zero count against a null, a 1971 year).
 * The fixture block proves the HAZARD is real; these prove the rules handle it.
 */

const BASE: NormalizedVersion = {
  discogsId: 1458122,
  title: 'Hot Tuna',
  label: 'RCA Victor',
  country: 'US',
  year: 1970,
  catalogNumber: 'LSP-4353',
  formats: ['LP', 'Album', 'Stereo'],
  isReissue: false,
  thumbUrl: null,
  communityHave: 3936,
  communityWant: 290,
};

function version(overrides: Partial<NormalizedVersion>): NormalizedVersion {
  return { ...BASE, ...overrides };
}

describe('comparisonKey', () => {
  it('is equal for versions the table cannot tell apart', () => {
    const a = version({ discogsId: 1458122, communityHave: 3936 });
    const b = version({ discogsId: 6825185, communityHave: 872 });

    // The id and the community counts differ; nothing DISPLAYED does.
    expect(comparisonKey(a)).toBe(comparisonKey(b));
  });

  it('differs when any displayed column differs', () => {
    for (const different of [
      { year: 1971 },
      { country: 'UK' },
      { catalogNumber: 'LSP-9999' },
      { label: 'RCA' },
      { formats: ['LP', 'Album', 'Repress', 'Stereo'] },
    ]) {
      expect(comparisonKey(version(different)), JSON.stringify(different)).not.toBe(
        comparisonKey(BASE),
      );
    }
  });

  it('treats a reissue as distinct, because the badge is displayed', () => {
    // §5.7 shows isReissue; two rows differing only by it are distinguishable.
    expect(comparisonKey(version({ isReissue: true }))).not.toBe(comparisonKey(BASE));
  });
});

describe('groupIdenticalVersions', () => {
  it('leaves distinguishable versions untouched, one group each', () => {
    const groups = groupIdenticalVersions([
      version({ discogsId: 1, catalogNumber: 'A' }),
      version({ discogsId: 2, catalogNumber: 'B' }),
    ]);

    expect(groups).toHaveLength(2);
    expect(groups.every((group) => group.versions.length === 1)).toBe(true);
  });

  /**
   * Five hand-built rows, and the count is arbitrary — it tests that N
   * identical rows become one group, not that this master has five. The real
   * master has three, which the fixture block below asserts against the
   * captured payload. The two numbers used to look like one claim.
   */
  it('collapses any number of identical rows into one group', () => {
    const groups = groupIdenticalVersions([
      version({ discogsId: 1458122, communityHave: 3936 }),
      version({ discogsId: 6825185, communityHave: 872 }),
      version({ discogsId: 2066235, communityHave: 271 }),
      version({ discogsId: 6440008, communityHave: 462 }),
      version({ discogsId: 6435148, communityHave: 47 }),
    ]);

    expect(groups).toHaveLength(1);
    expect(groups[0].versions).toHaveLength(5);
  });

  it('keeps a group ordered by how many people own each, most first', () => {
    /**
     * The only signal available to tell the collapsed rows apart, and it is a
     * genuine one: the pressing 3,936 people own is more likely to be the
     * common one than the pressing 47 people own. It does NOT identify which
     * one is in the user's hands, and the UI must not imply that it does.
     */
    const groups = groupIdenticalVersions([
      version({ discogsId: 6435148, communityHave: 47 }),
      version({ discogsId: 1458122, communityHave: 3936 }),
      version({ discogsId: 6825185, communityHave: 872 }),
    ]);

    expect(groups[0].versions.map((row) => row.discogsId)).toEqual([1458122, 6825185, 6435148]);
  });

  it('sorts a null count BELOW a genuine zero, not equal to it', () => {
    /**
     * The discriminating case, and a first version of this test missed it.
     *
     * With counts of `null` and `5`, treating null as 0 and treating it as -1
     * produce the SAME order — so a mutation replacing `?? -1` with `?? 0`
     * passed. A genuine zero has to be in the fixture for the rules to differ:
     * "nobody owns this" is information, "Discogs did not say" is not, and the
     * one that is information ranks higher.
     */
    const groups = groupIdenticalVersions([
      version({ discogsId: 1, communityHave: null }),
      version({ discogsId: 2, communityHave: 0 }),
      version({ discogsId: 3, communityHave: 5 }),
    ]);

    expect(groups[0].versions.map((row) => row.discogsId)).toEqual([3, 2, 1]);
  });

  it('preserves the order distinguishable groups arrived in', () => {
    // Discogs orders versions meaningfully; regrouping must not reshuffle rows
    // the user can already tell apart.
    const groups = groupIdenticalVersions([
      version({ discogsId: 1, year: 1970 }),
      version({ discogsId: 2, year: 1975 }),
      version({ discogsId: 3, year: 1970 }),
    ]);

    // 1 and 3 collapse; the 1975 row keeps its place after them.
    expect(groups.map((group) => group.versions[0].discogsId)).toEqual([1, 2]);
  });

  it('handles an empty list', () => {
    expect(groupIdenticalVersions([])).toEqual([]);
  });
});

describe('mustStayExpanded', () => {
  /**
   * §7.7's badge outranks the collapse. A version the user owns must never be
   * hidden inside a group — "you already have this" becoming silence is the
   * absence-as-success failure in the place it costs most: someone in a shop
   * reads no badge as "buy it".
   */
  const owned = (version: NormalizedVersion) => version.discogsId === 6825185;

  it('forces a group open when one of its versions is owned', () => {
    const [group] = groupIdenticalVersions([
      version({ discogsId: 1458122 }),
      version({ discogsId: 6825185 }),
    ]);

    expect(mustStayExpanded(group, owned)).toBe(true);
  });

  it('leaves a group collapsible when none is owned', () => {
    const [group] = groupIdenticalVersions([
      version({ discogsId: 1458122 }),
      version({ discogsId: 6440008 }),
    ]);

    expect(mustStayExpanded(group, owned)).toBe(false);
  });

  it('is false for a single version, which is not collapsed at all', () => {
    const [group] = groupIdenticalVersions([version({ discogsId: 6825185 })]);

    expect(mustStayExpanded(group, owned)).toBe(false);
  });
});

describe('the real Hot Tuna master, from the captured payload', () => {
  /**
   * **The fixture is the evidence the hazard exists.** Everything above tests
   * the RULES against hand-built rows; this tests that the situation the rules
   * exist for occurs in real Discogs data — which is the one thing a hand-built
   * fixture cannot establish, because it is the assumption most likely to be
   * wrong (test/fixtures/discogs/README.md).
   *
   * Loaded through the real normalizer, not read as raw JSON: the collapse acts
   * on `NormalizedVersion`, so a capture that stopped supporting the collapse
   * because NORMALIZATION changed would otherwise still pass.
   */
  const versions: NormalizedVersion[] = (
    JSON.parse(
      readFileSync('test/fixtures/discogs/master-versions-hot-tuna.json', 'utf8'),
    ) as { versions: unknown[] }
  ).versions.map(normalizeVersion);

  it('contains a group of genuinely indistinguishable US 1970 pressings', () => {
    const groups = groupIdenticalVersions(versions);
    const collapsed = groups.filter((group) => group.versions.length > 1);

    expect(collapsed, 'the master really does contain identical rows').toHaveLength(1);
    expect(
      collapsed[0].versions.length,
      'three of them — the docblock previously claimed five',
    ).toBe(3);

    // The property that makes them indistinguishable, asserted rather than
    // assumed: every displayed column agrees.
    const [first, ...rest] = collapsed[0].versions;
    for (const other of rest) {
      expect(comparisonKey(other)).toBe(comparisonKey(first));
      expect(other.discogsId, 'while the ids differ').not.toBe(first.discogsId);
    }
  });

  it('does NOT collapse the repress, which differs only by a descriptor', () => {
    /**
     * The discriminating neighbour, and the reason this fixture earns its place
     * over a constructed one. The same master carries a US/1970/LSP-4353
     * version whose only difference is `Repress` in the format descriptors — so
     * a comparison key ignoring descriptors would swallow a genuinely different
     * pressing into the collapsed group and tell the user it was the same
     * record. Real data supplies the near-miss; a hand-built fixture would only
     * contain it if someone had thought of it.
     */
    const groups = groupIdenticalVersions(versions);
    const collapsed = groups.find((group) => group.versions.length > 1);

    const repressInGroup = collapsed?.versions.some((row) =>
      row.formats.some((descriptor) => /repress/i.test(descriptor)),
    );

    expect(repressInGroup, 'a repress is a different pressing').toBe(false);
    expect(
      versions.some((row) => row.formats.some((descriptor) => /repress/i.test(descriptor))),
      'and the fixture does contain one, so this is a real test',
    ).toBe(true);
  });

  it('leaves the Japanese pressings distinguishable', () => {
    // Country is a displayed column, so nothing collapses across it. Asserted
    // against real rows because it is the ordinary case the collapse must not
    // touch.
    const groups = groupIdenticalVersions(versions);
    const japanese = versions.filter((row) => row.country === 'Japan');

    expect(japanese.length, 'the fixture carries Japanese pressings').toBeGreaterThan(0);

    for (const row of japanese) {
      const group = groups.find((candidate) =>
        candidate.versions.some((member) => member.discogsId === row.discogsId),
      );
      expect(group?.versions.every((member) => member.country === 'Japan')).toBe(true);
    }
  });
});
