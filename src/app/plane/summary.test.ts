import { describe, expect, it } from 'vitest';
import { recordSummary } from './summary';
import { factPanel, type PanelInput } from './panel';

/**
 * The summary card's CONTENT. Its rendered height — the load-bearing claim — is
 * measured in a browser by `e2e/summary-card.spec.ts`, because a constant height
 * is a fact about layout and a unit test asserting it would be asserting a
 * className.
 */

/** A record with nothing recorded beyond what every record has. */
const SPARSE: PanelInput = {
  title: 'Hex Enduction Hour',
  artistName: 'The Fall',
  releaseYear: 1982,
  snippet: null,
  snippetEditedAt: null,
  labelName: null,
  catalogNumber: null,
  yearPressed: null,
  countryPressed: null,
  pressingPlant: null,
  matrixRunout: null,
  vinylWeightGrams: null,
  colorVariant: null,
  isReissue: false,
  conditionMedia: null,
  conditionSleeve: null,
  purchasePrice: null,
  purchaseDate: null,
  storeName: null,
};

/** The same record with every optional field populated. */
const FULL: PanelInput = {
  ...SPARSE,
  labelName: 'Kamera',
  catalogNumber: 'KAM 005',
  yearPressed: 1982,
  countryPressed: 'UK',
  pressingPlant: 'Damont',
  matrixRunout: 'KAM 005 A1',
  vinylWeightGrams: 140,
  colorVariant: 'Black',
  isReissue: false,
  conditionMedia: 'VG+',
  conditionSleeve: 'VG',
  purchasePrice: '18.00',
  purchaseDate: '2024-03-02',
  storeName: 'Piccadilly Records',
};

describe('recordSummary', () => {
  it('carries artist, title and RELEASE year', () => {
    const summary = recordSummary(factPanel(SPARSE), 'r1');

    expect(summary.artist).toBe('The Fall');
    expect(summary.title).toBe('Hex Enduction Hour');
    expect(summary.year).toBe(1982);
  });

  /**
   * **The year is the RELEASE year, never the pressing year** (§4:
   * `release_year` is "the album's original release year, **not** this
   * pressing's year"), and this asserts it against `factPanel`, which is where
   * the choice is actually made.
   *
   * **Written against `recordSummary` first, and that version was decorative.**
   * `FactPanel` has no `yearPressed` field — the release/pressing choice
   * happens upstream in `factPanel` — so a mutation making `recordSummary` read
   * a pressing year had nothing to read and every test still passed. CLAUDE.md
   * §2: name the line of source a test would fail against. For this
   * distinction that line is `panel.ts`'s `year: record.releaseYear`, not
   * anything in `summary.ts`.
   *
   * The fixture makes the two DIVERGE, because a record whose reissue year
   * matches its release year cannot separate a correct implementation from one
   * reading the wrong column. Pressing-is-not-an-album (CLAUDE.md §8) in
   * miniature, and the summary inherits the answer rather than restating it.
   */
  it('reads the release year, not the pressing year, when they differ', () => {
    const reissue: PanelInput = { ...FULL, releaseYear: 1982, yearPressed: 2019, isReissue: true };

    expect(factPanel(reissue).year, 'the panel resolves the release year').toBe(1982);
    expect(recordSummary(factPanel(reissue), 'r1').year, 'and the summary carries it').toBe(1982);
  });

  it('omits the year rather than inventing one', () => {
    const undated: PanelInput = { ...SPARSE, releaseYear: null };

    expect(recordSummary(factPanel(undated), 'r1').year).toBeNull();
  });

  it('links to the record detail page', () => {
    expect(recordSummary(factPanel(SPARSE), 'abc-123').href).toBe('/records/abc-123');
  });

  /**
   * **The count is what makes the tap promise something specific.** "More" does
   * not say what it does; a count distinguishes a record with nothing else
   * recorded from one with a dozen fields, and tells the reader whether the trip
   * is worth taking.
   *
   * Fails against a `furtherFacts` hard-coded, or one counting GROUPS rather
   * than rows — a sparse record has zero of both, so only the populated fixture
   * separates those two implementations.
   */
  it('counts the further facts a tap would reveal', () => {
    const sparse = recordSummary(factPanel(SPARSE), 'r1');
    const full = recordSummary(factPanel(FULL), 'r1');

    expect(sparse.furtherFacts, 'nothing else is recorded').toBe(0);
    expect(full.furtherFacts, 'every optional field is populated').toBeGreaterThan(8);
  });

  /**
   * **The summary itself does not grow.** This is the unit-level half of the
   * constant-height claim: whatever the record holds, the summary carries the
   * same three values and one link.
   *
   * Fails against a `recordSummary` that folded any of `panel.groups` into its
   * own fields — which is the tempting change when a sparse card looks empty.
   */
  it('carries the same shape whether the record is sparse or fully documented', () => {
    const sparse = recordSummary(factPanel(SPARSE), 'r1');
    const full = recordSummary(factPanel(FULL), 'r1');

    expect(Object.keys(sparse).sort()).toEqual(Object.keys(full).sort());
    expect(sparse.title).toBe(full.title);
    expect(sparse.artist).toBe(full.artist);
    expect(sparse.year).toBe(full.year);
  });
});
