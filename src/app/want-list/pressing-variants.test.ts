import { describe, expect, it } from 'vitest';
import { pressingVariantPanel } from './pressing-variants';

/**
 * SPEC.md §12b (A55, 2026-09-08) — the HELD pressing facts, displayed rather
 * than described.
 *
 * **The defect this replaces.** A43's assessment was handed `{ artist, title }`
 * and nothing else, so for Deerhunter's *Halcyon Digest* it produced three
 * pressings under CAD 3016 — not the release — a gatefold that does not exist,
 * and a generic US/EU/repress frame. The real distinction was already in the
 * app's possession from a lookup: two variants differing in whether *Desire
 * Lines* fades early, told apart by "Salt" etched in the side B runout.
 *
 * **Display-only, because the descriptor IS the finding.** No prose is generated
 * about these values; they are shown. A model cannot fabricate a catalogue number
 * it was never asked to produce.
 *
 * **Three empty states, never one** — the same distinction the walk's zero needed
 * (A52), reused rather than rebuilt:
 *
 *   1. no pressing attached to this row — the app does not know which record
 *   2. a pressing attached, carrying no variant detail
 *   3. variant detail present
 */
describe('the pressing variant panel (A55)', () => {
  /**
   * Fails against a panel that renders nothing, or renders "no variant data",
   * when the row has no pressing at all. **This is the Halcyon Digest case**, and
   * showing nothing is the correct outcome — Adam never attached a pressing, so
   * the app genuinely does not know which record he is hunting.
   */
  it('says NO PRESSING ATTACHED when the row carries none', () => {
    const panel = pressingVariantPanel(null);

    expect(panel.state).toBe('no-pressing');
    expect(panel.fields).toEqual([]);
    expect(panel.message).toMatch(/no target pressing/i);
  });

  /**
   * Fails against collapsing this into `no-pressing`. A pressing IS attached and
   * the app knows which record — it simply holds no distinguishing detail, which
   * is a different fact and suggests a different action.
   */
  it('distinguishes an attached pressing with no variant detail', () => {
    const panel = pressingVariantPanel({
      catalogNumber: null,
      matrixRunout: null,
      countryPressed: null,
      colorVariant: null,
      pressingPlant: null,
      yearPressed: null,
    });

    expect(panel.state).toBe('no-detail');
    expect(panel.fields).toEqual([]);
    expect(panel.message).not.toMatch(/no target pressing/i);
  });

  /**
   * The Halcyon Digest case as it WOULD have read with the pressing attached —
   * the descriptor and the runout, verbatim, which is the whole finding.
   */
  it('shows the variant descriptor and the runout verbatim', () => {
    const panel = pressingVariantPanel({
      catalogNumber: 'CAD 3X38',
      matrixRunout: 'Salt',
      countryPressed: 'UK',
      colorVariant: 'White, Early fadeout (Desire Lines)',
      pressingPlant: null,
      yearPressed: null,
    });

    expect(panel.state).toBe('detail');
    const labels = panel.fields.map((f) => f.label);
    expect(labels).toContain('Variant');
    expect(labels).toContain('Matrix / runout');

    const variant = panel.fields.find((f) => f.label === 'Variant');
    expect(variant?.value, 'verbatim, not paraphrased').toBe(
      'White, Early fadeout (Desire Lines)',
    );
    const runout = panel.fields.find((f) => f.label === 'Matrix / runout');
    expect(runout?.value).toBe('Salt');
  });

  /**
   * Fails against a panel that pads absent fields with an em-dash. Unlike the
   * collection table, this panel's purpose is to show what DISTINGUISHES a
   * pressing — a row of dashes would be noise where the collection's table needs
   * column alignment.
   */
  it('omits fields the pressing does not carry', () => {
    const panel = pressingVariantPanel({
      catalogNumber: 'CAD 3X38',
      matrixRunout: null,
      countryPressed: null,
      colorVariant: null,
      pressingPlant: null,
      yearPressed: null,
    });

    expect(panel.fields.map((f) => f.label)).toEqual(['Catalogue number']);
  });

  /**
   * Fails against a panel that treats whitespace as content — a pressing whose
   * fields are empty strings rather than null is the same absence.
   */
  it('treats blank strings as absent', () => {
    const panel = pressingVariantPanel({
      catalogNumber: '   ',
      matrixRunout: '',
      countryPressed: null,
      colorVariant: null,
      pressingPlant: null,
      yearPressed: null,
    });

    expect(panel.state).toBe('no-detail');
  });

  /**
   * **A year is shown but never alone**, carrying A43's rule forward: a year is
   * an output of identification rather than an input to it, so it cannot be the
   * only thing distinguishing a pressing.
   */
  it('does not count a year alone as variant detail', () => {
    const panel = pressingVariantPanel({
      catalogNumber: null,
      matrixRunout: null,
      countryPressed: null,
      colorVariant: null,
      pressingPlant: null,
      yearPressed: 2010,
    });

    expect(panel.state, 'a year cannot be checked in a shop (A43)').toBe('no-detail');
  });
});
