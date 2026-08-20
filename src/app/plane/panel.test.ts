import { describe, expect, it } from 'vitest';
import { factPanel, type PanelInput } from './panel';

/**
 * The facts beside the record (§10b, A19e), which are the reason the object was
 * moved to a renderer at all: with the copy off it, the faces are printed
 * artwork and the rotation has something to be a rotation *of*.
 *
 * **`backFaceGroups` is the producer and is reused, not reimplemented.** It
 * already decides which fields exist, how they are formatted, and what absence
 * means. A second producer of the same facts is the shape NOTES records under
 * `genreSubtree` and again under `hasGatefold` — so what is tested here is the
 * heading the panel adds on top, and that the rest passes through untouched.
 */

/** The common case in production: a title, an artist, and nothing else at all. */
const bare: PanelInput = {
  title: 'Grave New World',
  artistName: 'Discharge',
  releaseYear: null,
  labelName: null,
  catalogNumber: null,
  matrixRunout: null,
  yearPressed: null,
  countryPressed: null,
  pressingPlant: null,
  vinylWeightGrams: null,
  colorVariant: null,
  isReissue: false,
  snippet: null,
  snippetEditedAt: null,
  conditionMedia: null,
  conditionSleeve: null,
  purchasePrice: null,
  purchaseDate: null,
  storeName: null,
};

describe('factPanel — the heading', () => {
  it('always carries artist and title, which no group supplies', () => {
    /**
     * Fails against `factPanel`'s heading construction. `backFaceGroups` covers
     * imprint, pressing and provenance — artist and title were the FACE's
     * heading in the CSS version, so nothing produces them for a panel. A panel
     * without them names no record.
     */
    const panel = factPanel(bare);

    expect(panel.title).toBe('Grave New World');
    expect(panel.artist).toBe('Discharge');
  });

  it('omits the year when there is none, rather than printing a blank', () => {
    /**
     * Fails against the heading's year handling. Most records arrive from a
     * quick entry with no release year, so this is ordinary — and a heading
     * reading "Discharge · " with nothing after the separator is the empty-label
     * failure that made the old back face read as a form.
     */
    expect(factPanel(bare).year).toBeNull();
    expect(factPanel({ ...bare, releaseYear: 1982 }).year).toBe(1982);
  });
});

describe('factPanel — groups', () => {
  it('renders NO groups for a record with nothing optional set', () => {
    /**
     * **The discriminating fixture**, and the reason it is the bare record
     * rather than a full one.
     *
     * A fixture where every field is populated cannot tell "omits absent
     * fields" from "renders every field it is given" — both produce the same
     * output. Only the record with nothing set separates them, and that record
     * is the common case in production rather than an edge case.
     *
     * Fails against the panel if it ever renders a labelled row with no value,
     * which is the "field of empty labels" this unit exists to avoid.
     */
    expect(factPanel(bare).groups).toEqual([]);
  });

  it('passes groups through from backFaceGroups unchanged', () => {
    /**
     * Fails against `factPanel` if it filters, reorders or relabels. The point
     * of reusing the producer is that one module decides what a fact is called
     * and whether it exists; a panel that post-processes the result becomes a
     * second producer wearing a thin disguise.
     */
    const panel = factPanel({
      ...bare,
      labelName: 'Clay Records',
      catalogNumber: 'CLAYLP 3',
      countryPressed: 'UK',
      purchasePrice: '12.50',
    });

    expect(panel.groups.map((group) => group.kind)).toEqual([
      'imprint',
      'pressing',
      'provenance',
    ]);
    expect(panel.groups[0].rows.map((row) => row.value)).toEqual(['Clay Records', 'CLAYLP 3']);
  });

  it('drops a group whose fields are all absent, not just its rows', () => {
    /**
     * Fails if an empty group survives with zero rows — which would render a
     * heading with nothing beneath it, asserting that something is missing. A
     * record with a label but no pressing and no provenance is extremely
     * common: Discogs supplies the imprint and nothing else.
     */
    const panel = factPanel({ ...bare, labelName: 'Clay Records' });

    expect(panel.groups.map((group) => group.kind)).toEqual(['imprint']);
    for (const group of panel.groups) expect(group.rows.length).toBeGreaterThan(0);
  });
});

describe('§10b: the snippet in the wall panel', () => {
  /**
   * Fails against: a panel that shows the snippet WITHOUT its label.
   *
   * **The label is the whole reason this is safe to show here.** §10b puts the
   * snippet where liner notes would sit, so it must not read as liner notes —
   * "in the same register as Discogs estimates, never presented as fact the app
   * established". Nothing in the pipeline verified the text; withholding the
   * record's own facts is the only enforced mitigation, so the label carries
   * what the code cannot.
   */
  it('carries the generated label with the text', () => {
    const panel = factPanel({
      ...bare,
      snippet: 'A 1982 hardcore record that reshaped the scene.',
      snippetEditedAt: null,
    });

    expect(panel.snippet).toEqual({
      text: 'A 1982 hardcore record that reshaped the scene.',
      generated: true,
    });
  });

  /**
   * Fails against: a panel that calls the user's own writing generated.
   *
   * Once edited the text is theirs (§7.8), and the label must say so — the same
   * misattribution as presenting the model's writing as fact, reversed.
   */
  it('does not label an edited snippet as generated', () => {
    const panel = factPanel({
      ...bare,
      snippet: 'My own note.',
      snippetEditedAt: new Date('2026-08-20T12:00:00Z'),
    });

    expect(panel.snippet).toEqual({ text: 'My own note.', generated: false });
  });

  /**
   * Fails against: a panel that renders an empty snippet block.
   *
   * §10b: "A record with no snippet shows none, and no placeholder invites one."
   * Null rather than an empty string, so the component has nothing to render
   * rather than something empty to render.
   */
  it('is null when there is no snippet', () => {
    const panel = factPanel({ ...bare, snippet: null, snippetEditedAt: null });

    expect(panel.snippet).toBeNull();
  });
});
