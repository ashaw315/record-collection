import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalizeRelease } from '@/lib/discogs/normalize-release';
import { pressingEvidence } from './pressing-evidence';

/**
 * SPEC.md §12 step 14c — verification-by-display.
 *
 * These tests are about ONE question: does the shape this module returns let a
 * person tell two pressings apart, and does it refuse to invent a difference
 * when there is none? Every assertion below names the behaviour in
 * `pressing-evidence.ts` it would fail against.
 */

const load = (name: string) =>
  JSON.parse(readFileSync(`test/fixtures/discogs/${name}.json`, 'utf8')) as unknown;

const collisionA = load('release-collision-clay-lp-3-a');
const collisionB = load('release-collision-clay-lp-3-b');
const detailed = load('release-detailed');
const noMatrix = load('release-no-matrix');

describe('the collision pair the feature exists for', () => {
  /**
   * The premise. If this ever fails, the fixture stopped being a collision and
   * every other test in this file is demonstrating the feature on a case that
   * did not need it — see the fixture README.
   */
  it('is identical on the columns a search result displays', () => {
    const [a, b] = [normalizeRelease(collisionA), normalizeRelease(collisionB)];

    expect({
      country: a.country,
      year: a.year,
      catalogNumber: a.catalogNumber,
      label: a.label,
      formats: a.formats,
    }).toEqual({
      country: b.country,
      year: b.year,
      catalogNumber: b.catalogNumber,
      label: b.label,
      formats: b.formats,
    });
  });

  /**
   * **The feature's whole reason for existing, as one assertion.** Two cards
   * the user cannot tell apart must produce evidence panels they CAN.
   *
   * Fails against `pressingEvidence` returning anything that does not vary
   * between these two releases — including the naive implementation that
   * renders runout VALUES only, which is a real hazard here: this pair's
   * runouts are byte-identical, and the difference lives in the identifier
   * descriptions, the companies and the notes.
   */
  it('produces DIFFERENT evidence for the two releases', () => {
    const a = pressingEvidence(normalizeRelease(collisionA));
    const b = pressingEvidence(normalizeRelease(collisionB));

    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });

  /**
   * And says WHERE it differs, because "the JSON differs" would also pass if
   * the only difference were an incidental field nobody displays.
   *
   * Measured from the captured payloads: `Lacquer Cut At: Tape One` is on
   * 4878030 and absent from 10405725.
   */
  it('separates them on a company the user can check', () => {
    const a = pressingEvidence(normalizeRelease(collisionA));
    const b = pressingEvidence(normalizeRelease(collisionB));

    const names = (evidence: ReturnType<typeof pressingEvidence>) =>
      evidence.companies.map((company) => `${company.role}: ${company.name}`);

    expect(names(a)).toContain('Lacquer Cut At: Tape One');
    expect(names(b)).not.toContain('Lacquer Cut At: Tape One');
  });

  /**
   * **The honest half, and it is not a lesser case.** These two records carry
   * BYTE-IDENTICAL deadwax — Discogs' own note on 10405725 says so: "Identical
   * (matrix) to [r=4878030] but without the 'Pay no more than £3.99' mention on
   * the sleeve."
   *
   * So the module must report the runouts as the same. An implementation that
   * manufactured a difference to make the panels look more useful would fail
   * here, and that is the §12 step 14c rule against inventing a difference,
   * pinned rather than described.
   */
  it('reports the runouts as identical, because they are', () => {
    const a = pressingEvidence(normalizeRelease(collisionA));
    const b = pressingEvidence(normalizeRelease(collisionB));

    expect(a.runouts.map((r) => r.value)).toEqual(b.runouts.map((r) => r.value));
  });
});

describe('runouts render verbatim', () => {
  /**
   * **THE RULE THIS FEATURE LIVES OR DIES BY** (§12 step 14c). The parse layer
   * is already guarded; this pins the shape the RENDER layer receives, which
   * the prompt explicitly calls out as unguarded. Fails against any `.trim()`,
   * whitespace collapse, glyph strip or `meaningful()` added to
   * `pressingEvidence`'s runout mapping.
   *
   * Every string here is REAL: taken from the runouts measured for §12 step 14c
   * and from the committed collision pair. Constructed with escapes where the
   * hazard is invisible, so no formatter can silently repair the precondition
   * (CLAUDE.md §2's NFD/NFC lesson).
   *
   * Each carries a whitespace hazard AND a content hazard, because they guard
   * different mutations: trimming/collapsing versus `meaningful()` or glyph
   * stripping. An earlier version of this list had three entries that survived
   * tidying unchanged — they would have passed against any implementation,
   * which is precisely the decorative test §2 forbids. The precondition test
   * below is what caught them.
   */
  const HAZARDS = [
    '  leading and trailing  ',
    'interior  double  spaces',
    'BSK-1-3010 LW2 F12 (scratched out)-W-1  KP SUB #1  MASTERED BY CAPITOL',
    'BSK-1-3010 LW1 F6 4  \u25B321970 4 MASTERED BY CAPITOL   KP',
    'JW10 FS7\u2022 #2  MASTERED BY CAPITOL  \u2732  KP',
    ' Back With Bilbo Clay-LP-3-A2  LYN-15062 Damont ',
  ];

  it.each(HAZARDS)('preserves %j exactly', (raw) => {
    const evidence = pressingEvidence(
      normalizeRelease({
        id: 1,
        identifiers: [{ type: 'Matrix / Runout', value: raw }],
      }),
    );

    expect(evidence.runouts[0]?.value).toBe(raw);
  });

  /**
   * **The precondition, asserted rather than assumed.** If a hazard string
   * survives tidying unchanged, the test above passes against a NORMALIZING
   * implementation and proves nothing — a test that resembles verification
   * without constraining the code.
   */
  it.each(HAZARDS)('uses %j, which tidying would actually change', (raw) => {
    const tidied = raw.trim().replace(/\s+/g, ' ');

    expect(tidied, `${JSON.stringify(raw)} must be changed by tidying`).not.toBe(raw);
  });

  /**
   * The glyphs specifically. Whitespace is one mutation; a stripper that
   * removed non-ASCII characters would pass every trim assertion above while
   * destroying the exact marks that separate two Rumours pressings.
   */
  it('preserves unicode glyphs a stripper would remove', () => {
    const value = 'F24 \u25B3 \u2732 \u2022 end';

    const evidence = pressingEvidence(
      normalizeRelease({ id: 1, identifiers: [{ type: 'Matrix / Runout', value }] }),
    );

    expect(evidence.runouts[0]?.value).toBe(value);
    // The precondition: these really are non-ASCII.
    expect(/[^\x20-\x7E]/.test(value)).toBe(true);
  });

  /**
   * `meaningful()` maps Discogs' prose-absence values to null. A runout
   * legitimately reading "NONE" is a transcription of what is etched there,
   * and must survive — the inverted-normalizer rule at the panel layer.
   */
  it('keeps a runout that reads like an absence marker', () => {
    const evidence = pressingEvidence(
      normalizeRelease({ id: 1, identifiers: [{ type: 'Matrix / Runout', value: 'NONE' }] }),
    );

    expect(evidence.runouts[0]?.value).toBe('NONE');
  });
});

describe('notes are structurally separate from evidence', () => {
  /**
   * §12 step 14c: identifiers and companies are checkable against the object;
   * notes are someone's description. They are different KINDS of thing, and
   * the separation is structural so a future change cannot flatten them —
   * the same shape as `RecordSummary` keeping `snippet` and `factGroups` apart.
   *
   * Fails against any implementation that concatenates notes into the
   * identifier or company lists.
   */
  it('carries notes in their own field, not among the identifiers', () => {
    const evidence = pressingEvidence(normalizeRelease(collisionB));

    expect(evidence.notes).toContain('Identical (matrix) to');

    const evidenceText = JSON.stringify({
      runouts: evidence.runouts,
      otherIdentifiers: evidence.otherIdentifiers,
      companies: evidence.companies,
    });
    expect(evidenceText).not.toContain('Identical (matrix) to');
  });
});

describe('absence reads as absence', () => {
  /**
   * §12 step 14c: "A release with no matrix — 3 of 41 measured — shows that it
   * has none, not an empty row that looks like a missing field."
   *
   * Fails against an implementation that returns `runouts: []` with no way for
   * the panel to distinguish "none" from "not asked".
   */
  it('says a release has no runout rather than returning a blank', () => {
    const evidence = pressingEvidence(normalizeRelease(noMatrix));

    expect(evidence.runouts).toHaveLength(0);
    expect(evidence.hasEvidence).toBe(false);
  });

  it('reports evidence present when a release genuinely carries some', () => {
    const evidence = pressingEvidence(normalizeRelease(detailed));

    expect(evidence.runouts.length).toBeGreaterThan(0);
    expect(evidence.hasEvidence).toBe(true);
  });
});
