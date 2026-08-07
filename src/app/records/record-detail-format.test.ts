import { describe, expect, it } from 'vitest';
import { conditionLabel, pressingFacts, vinylWeight } from './record-detail-format';

/**
 * Display decisions for the record detail screen (SPEC.md §10).
 *
 * Every pressing column is nullable, so this file is almost entirely about
 * ABSENCE — which fields to omit, which to name, and where a missing value is
 * information rather than a gap.
 */

describe('pressingFacts', () => {
  const full = {
    catalogNumber: 'CLAY LP 3',
    matrixRunout: 'CLAYLP3-A1',
    pressingPlant: 'Damont',
    yearPressed: 1982,
    countryPressed: 'UK',
    vinylWeightGrams: 180,
    colorVariant: 'Black',
    isReissue: false,
  };

  it('names every fact that is present', () => {
    const facts = pressingFacts(full);

    expect(facts.map((fact) => fact.label)).toEqual([
      'Catalog number',
      'Matrix / runout',
      'Pressing plant',
      'Pressed',
      'Country',
      'Weight',
      'Colour',
    ]);
  });

  it('omits an absent fact rather than showing it empty', () => {
    // A detail screen listing "Pressing plant: —" for every record teaches the
    // reader to skip the whole block. Absent facts are simply not rows.
    const facts = pressingFacts({ ...full, pressingPlant: null, colorVariant: null });

    expect(facts.map((fact) => fact.label)).not.toContain('Pressing plant');
    expect(facts.map((fact) => fact.label)).not.toContain('Colour');
  });

  it('returns nothing when the pressing carries no facts at all', () => {
    // A found-or-created pressing row can be almost empty (§4). The caller
    // renders no section rather than an empty one.
    expect(
      pressingFacts({
        catalogNumber: null,
        matrixRunout: null,
        pressingPlant: null,
        yearPressed: null,
        countryPressed: null,
        vinylWeightGrams: null,
        colorVariant: null,
        isReissue: false,
      }),
    ).toEqual([]);
  });

  /**
   * `is_reissue` is a BOOLEAN, so false is a real answer rather than an absent
   * one — but only the true case is worth a row. "Reissue: no" on every
   * original is noise; "Reissue" on a reissue is the fact a collector wants.
   */
  it('shows a reissue marker only when it is one', () => {
    const original = pressingFacts(full).map((fact) => fact.label);
    const reissue = pressingFacts({ ...full, isReissue: true }).map((fact) => fact.label);

    expect(original).not.toContain('Reissue');
    expect(reissue).toContain('Reissue');
  });

  /**
   * The matrix/runout is user-authoritative (CLAUDE.md §8) and is the string
   * where a single character decides which pressing you are holding. It is
   * flagged for mono rendering here rather than the component guessing.
   */
  it('marks the identifiers that must be set in mono', () => {
    const facts = pressingFacts(full);
    const mono = facts.filter((fact) => fact.mono).map((fact) => fact.label);

    expect(mono).toEqual(['Catalog number', 'Matrix / runout']);
  });

  it('formats the pressed year without a thousands separator', () => {
    // toLocaleString() would render 1982 as "1,982".
    const pressed = pressingFacts(full).find((fact) => fact.label === 'Pressed');

    expect(pressed?.value).toBe('1982');
  });
});

describe('vinylWeight', () => {
  it('names the unit, because the number alone is ambiguous', () => {
    expect(vinylWeight(180)).toBe('180 g');
  });

  it('is undefined when unknown', () => {
    expect(vinylWeight(null)).toBeUndefined();
  });
});

describe('conditionLabel', () => {
  /**
   * Grades are an established vocabulary (§4.1's enum) and a collector reads
   * "VG+" faster than "Very Good Plus". The expansion is for the tooltip, not
   * the value.
   */
  it('expands a grade for the title attribute', () => {
    expect(conditionLabel('VG+')).toBe('Very Good Plus');
    expect(conditionLabel('NM')).toBe('Near Mint');
    expect(conditionLabel('M')).toBe('Mint');
    expect(conditionLabel('P')).toBe('Poor');
  });

  it('returns undefined for an ungraded record rather than inventing a grade', () => {
    // §4.2 makes the condition columns nullable so a record can be logged
    // before it is graded — "ungraded" is not a grade.
    expect(conditionLabel(null)).toBeUndefined();
  });

  it('covers every grade in the enum, so none renders without an expansion', () => {
    // The list is closed (§4.1). A grade added to the schema without a label
    // here would render bare, and this is what catches that.
    for (const grade of ['M', 'NM', 'VG+', 'VG', 'G+', 'G', 'F', 'P'] as const) {
      expect(conditionLabel(grade), grade).toBeDefined();
    }
  });
});
