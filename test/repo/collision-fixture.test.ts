import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

/**
 * The capture script's collision cross-check, as a committed test.
 *
 * CLAUDE.md §2: "A throwaway probe becomes a test before the unit is done."
 * This logic was written as a scratch probe to check the verifier before
 * spending live Discogs calls on it, and a verifier that has only ever been run
 * by hand is exactly the shape §2 warns about — `scripts/capture-discogs-fixtures.mjs`
 * runs by deliberate human act, so nothing in CI ever executes its predicates.
 *
 * **What this constrains that the script cannot.** The script checks the pair
 * at CAPTURE time. This checks the pair that is COMMITTED, on every run — so a
 * re-capture that quietly lands a non-colliding pair, or an edit to either
 * fixture, fails here rather than silently turning every test in
 * `pressing-evidence.test.ts` into a demonstration on the easy case.
 *
 * See `test/fixtures/discogs/README.md` for where the ids came from.
 */

type Release = {
  id: number;
  country?: string;
  year?: number;
  released?: string;
  labels?: Array<{ catno?: string; name?: string }>;
  formats?: Array<{ name?: string; descriptions?: string[]; text?: string }>;
  identifiers?: Array<{ type?: string; value?: string; description?: string | null }>;
  companies?: Array<{ entity_type_name?: string; name?: string }>;
  notes?: string;
};

const load = (name: string): Release =>
  JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8')) as Release;

const A = load('release-collision-clay-lp-3-a');
const B = load('release-collision-clay-lp-3-b');

/** The columns a `/lookup` search row displays — the collision is defined here. */
function displayedColumns(release: Release) {
  const format = release.formats?.[0];

  return {
    country: release.country ?? null,
    released: String(release.year ?? release.released ?? ''),
    catno: release.labels?.[0]?.catno ?? null,
    label: release.labels?.[0]?.name ?? null,
    format: [format?.name, ...(format?.descriptions ?? [])].filter(Boolean).join(', '),
    formatText: format?.text ?? null,
  };
}

/** What the evidence panel puts side by side. */
const evidenceOf = (release: Release) =>
  JSON.stringify({
    identifiers: (release.identifiers ?? []).map((i) => [i.type, i.value, i.description]),
    companies: (release.companies ?? []).map((c) => [c.entity_type_name, c.name]),
    notes: release.notes ?? null,
  });

describe('the committed collision pair', () => {
  it('is the pair the README names, not whatever was captured last', () => {
    expect(A.id).toBe(4878030);
    expect(B.id).toBe(10405725);
  });

  /**
   * Direction 1. If they differ on a displayed column, the results list already
   * separates them and the feature is being demonstrated on a case that did not
   * need it.
   */
  it('is IDENTICAL on every displayed column', () => {
    expect(displayedColumns(A)).toEqual(displayedColumns(B));
  });

  /**
   * Direction 2. If identifiers, companies and notes are all identical, the
   * feature cannot separate them either — and a test built on the pair would be
   * asserting that two things look alike, which a broken implementation passes.
   *
   * Both directions are needed: (1) alone admits a fixture the feature cannot
   * help with, (2) alone admits one that never needed it.
   */
  it('is DIFFERENT on the evidence the panel displays', () => {
    expect(evidenceOf(A)).not.toBe(evidenceOf(B));
  });

  /**
   * The captured reality, pinned because it drove the design: these two records
   * carry byte-identical deadwax, and Discogs says so in B's own notes. A
   * re-capture that changed this would mean the "genuinely indistinguishable
   * runout" case is no longer covered by the primary fixture, which is a
   * decision to make deliberately rather than discover later.
   */
  it('carries byte-identical runouts, so the honest case stays covered', () => {
    const runouts = (release: Release) =>
      (release.identifiers ?? [])
        .filter((i) => /matrix|runout/i.test(i.type ?? ''))
        .map((i) => i.value);

    expect(runouts(A)).toEqual(runouts(B));
    expect(runouts(A).length).toBeGreaterThan(0);
  });
});

describe('the cross-check logic itself', () => {
  /**
   * The probe that ran before the live capture, kept. It proves the check can
   * FAIL — a verifier nothing has ever seen reject is not known to reject.
   */
  const base = {
    id: 1,
    country: 'UK',
    year: 1984,
    labels: [{ catno: 'CLAY LP 3', name: 'Clay Records' }],
    formats: [{ name: 'Vinyl', descriptions: ['LP', 'Album', 'Repress'] }],
  } satisfies Release;

  it('rejects a pair that is separable at the list level', () => {
    const mispress: Release = {
      ...base,
      formats: [{ name: 'Vinyl', descriptions: ['LP', 'Album', 'Mispress', 'Repress'] }],
    };

    expect(displayedColumns(base)).not.toEqual(displayedColumns(mispress));
  });

  it('rejects a pair whose evidence is identical', () => {
    const twin: Release = { ...base, id: 2 };

    expect(evidenceOf(base)).toBe(evidenceOf(twin));
  });
});
