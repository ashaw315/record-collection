import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPINE_COLOUR,
  spineText,
  spineWidth,
  textColourOn,
  MIN_SPINE_WIDTH,
  MAX_SPINE_WIDTH,
} from './spine';

/**
 * The decisions behind §10b's spines, separated from the markup.
 *
 * Pure because these are rules — how wide a spine is, what it says, whether its
 * text is light or dark — and a component test would confirm whatever the
 * component produced without stating what it should be. Same reasoning as
 * `gallery-order` and `sparkline`.
 */

describe('spineText', () => {
  it('reads artist, title and catalogue number (§10b)', () => {
    expect(
      spineText({ artistName: 'Discharge', title: 'Hear Nothing', catalogNumber: 'CLAYLP 3' }),
    ).toBe('Discharge · Hear Nothing · CLAYLP 3');
  });

  it('omits a missing catalogue number rather than leaving a dangling separator', () => {
    /**
     * The common case, not an edge: §10's quick in-store entry leaves it blank,
     * and a spine reading "Discharge · Hear Nothing · " has a gap the reader has
     * to interpret.
     */
    expect(spineText({ artistName: 'Discharge', title: 'Hear Nothing', catalogNumber: null })).toBe(
      'Discharge · Hear Nothing',
    );
  });

  it('keeps the catalogue number even when it is the only identifier', () => {
    // §10b: "the catalogue number is the collector's identifier and earns its
    // space." It is not decoration to drop when the spine is crowded.
    expect(spineText({ artistName: 'A', title: 'B', catalogNumber: 'XYZ 1' })).toContain('XYZ 1');
  });
});

describe('spineWidth', () => {
  /**
   * A spine's width stands for how much shelf the record occupies. Records are
   * physically near-identical, so this varies only a little — enough that the
   * wall has texture rather than reading as a barcode, not so much that it
   * implies a fact about thickness nobody recorded.
   */
  it('is stable for the same record across calls', () => {
    // §8.2's determinism rule, which outlived the feature it was written for: a
    // wall that reshuffles or resizes between loads cannot be scanned by eye.
    const id = '158a3163-6a56-4673-8f88-27e7b2aec724';

    expect(spineWidth(id)).toBe(spineWidth(id));
  });

  it('stays within the bounds a shelf can render', () => {
    for (const id of ['a', 'b', 'zzz', '158a3163-6a56-4673-8f88-27e7b2aec724', '']) {
      expect(spineWidth(id)).toBeGreaterThanOrEqual(MIN_SPINE_WIDTH);
      expect(spineWidth(id)).toBeLessThanOrEqual(MAX_SPINE_WIDTH);
    }
  });

  it('varies between records, so the wall is not a barcode', () => {
    const widths = new Set(
      ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map(spineWidth),
    );

    expect(widths.size, 'eight records produce more than one width').toBeGreaterThan(1);
  });
});

describe('textColourOn', () => {
  /**
   * Spine text has to be readable against a colour taken from a photograph, and
   * that colour is anything. Choosing by luminance is the only thing that works
   * for both a near-black Discharge sleeve and a cream Dire Straits one.
   */
  it('uses light text on a dark spine', () => {
    // Grave New World, measured: #363129.
    expect(textColourOn('#363129')).toBe('light');
  });

  it('uses dark text on a pale spine', () => {
    // Dire Straits, measured: #d8cbb8.
    expect(textColourOn('#d8cbb8')).toBe('dark');
  });

  it('judges by luminance, not by lightness of the biggest channel', () => {
    /**
     * The discriminating case. Pure blue `#0000ff` has a high channel value and
     * is dark to the eye; pure yellow `#ffff00` is the reverse. A rule keyed on
     * `max(r,g,b)` calls both light and puts white text on yellow.
     */
    expect(textColourOn('#0000ff')).toBe('light');
    expect(textColourOn('#ffff00')).toBe('dark');
  });

  it('treats a missing colour as the default spine', () => {
    // A record with no cover gets a plain spine (§10b), and its text has to be
    // legible on whatever that is.
    expect(textColourOn(null)).toBe(textColourOn(DEFAULT_SPINE_COLOUR));
  });

  it('falls back rather than throwing on a malformed value', () => {
    /**
     * `spine_colour` is a TEXT column with no CHECK, so a hand-edited row can
     * hold anything. A shelf that throws on one bad value renders nothing at
     * all — the whole wall lost to one record.
     */
    expect(() => textColourOn('not-a-colour')).not.toThrow();
    expect(textColourOn('not-a-colour')).toBe(textColourOn(DEFAULT_SPINE_COLOUR));
  });
});
