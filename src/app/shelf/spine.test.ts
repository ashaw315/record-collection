import { describe, expect, it } from 'vitest';
import {
  DEFAULT_SPINE_COLOUR,
  spineText,
  spineWidth,
  textColourOn,
  MIN_SPINE_WIDTH,
  SPINE_HEIGHT,
  SPINE_TEXT_BUDGET,
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
    // A spine that FITS: 29 characters against a 31-character budget. A first
    // version of this used Discharge / Hear Nothing / CLAYLP 3, which is 33 —
    // so the assertion demanded the untruncated form of a string that does not
    // fit, and failed against correct code.
    expect(
      spineText({ artistName: 'Discharge', title: 'Why', catalogNumber: 'CLAYLP 3' }),
    ).toBe('Discharge  Why  CLAYLP 3');
  });

  it('omits a missing catalogue number rather than leaving a dangling gap', () => {
    /**
     * The common case, not an edge: §10's quick in-store entry leaves it blank,
     * and a trailing separator is a gap the reader has to interpret.
     */
    expect(spineText({ artistName: 'Discharge', title: 'Hear Nothing', catalogNumber: null })).toBe(
      'Discharge  Hear Nothing',
    );
  });

  it('leaves a short spine untouched', () => {
    // Nothing is truncated that fits. Measured from the real collection: this
    // one is 24 characters against a 31-character budget.
    expect(spineText({ artistName: 'John Lennon', title: 'test', catalogNumber: '1a 20' })).toBe(
      'John Lennon  test  1a 20',
    );
  });
});

describe('spineText — fitting the budget', () => {
  /**
   * **Truncated to FIT, not to a fixed length**, and the title is the casualty.
   *
   * A 210px spine at 9px mono holds about 31 characters. Measured against the
   * real collection, four of five spines overflowed — 38, 41, 43 and 49
   * characters — clipped at BOTH ends by the browser, which took the catalogue
   * number with it.
   *
   * §10b names the priority: the catalogue number "is the collector\'s
   * identifier and earns its space", and the artist is how a record is found.
   * The title is what a collector can lose and still identify the record, so
   * the title absorbs the shortfall. A short spine loses nothing; a long one
   * loses exactly enough.
   */
  it('shortens the title so artist and catalogue number both survive', () => {
    const text = spineText({
      artistName: 'Luther Vandross',
      title: 'Never Too Much',
      catalogNumber: 'FE 37451',
    });

    /**
     * At the 160px spine's 29-character budget this record's two identifiers
     * take 25, leaving 2 for the title — below the three-character floor, so
     * the title is DROPPED rather than shown as a stub. That is the rule
     * working, not a gap in it: "N…" costs space the identifiers need and tells
     * the reader nothing.
     *
     * This asserted an ellipsis when the budget was 31 and the spine 210px
     * tall. The property under test — both identifiers survive, the title
     * absorbs the shortfall — is unchanged; only how much shortfall there is
     * moved.
     */
    expect(text.length).toBeLessThanOrEqual(SPINE_TEXT_BUDGET);
    expect(text, 'the artist is whole').toContain('Luther Vandross');
    expect(text, 'the identifier is whole').toContain('FE 37451');
    expect(text, 'the title gave way entirely').not.toContain('Never');
  });

  it('never truncates the catalogue number while the title has room to give', () => {
    // The rule that makes the priority real rather than stated.
    const text = spineText({
      artistName: 'The Blues Project',
      title: 'The Best Of The Blues Project',
      catalogNumber: 'ABC 123',
    });

    expect(text).toContain('ABC 123');
    expect(text.length).toBeLessThanOrEqual(SPINE_TEXT_BUDGET);
  });

  it('drops the title entirely rather than showing a stub of it', () => {
    /**
     * Below a couple of characters a truncated title is noise — "N…" tells the
     * reader nothing and costs space the identifiers need. Absence is cleaner
     * than a stub.
     */
    const text = spineText({
      artistName: 'Emerson, Lake & Palmer',
      title: 'Brain Salad Surgery',
      catalogNumber: 'K 50422',
    });

    /**
     * Emerson, Lake & Palmer plus K 50422 is 31 against a 29 budget, so this is
     * now the DEGENERATE case rather than merely a tight one: the artist gives
     * way and the identifier survives whole. The shorter spine moved this
     * record across that line, which is worth stating — the same input tests a
     * different branch than it did at 210px.
     */
    expect(text).toMatch(/^Emerson/);
    expect(text).toContain('K 50422');
    expect(text.length).toBeLessThanOrEqual(SPINE_TEXT_BUDGET);
  });

  it('truncates the ARTIST when artist and catalogue alone exceed the budget', () => {
    /**
     * **The degenerate case, and it is not hypothetical.** Measured across
     * plausible collections, four of six artist/catalogue pairs blow the budget
     * before the title gets a character: Crosby, Stills, Nash & Young + SD 7200
     * is 37 against 31.
     *
     * The artist gives way, not the catalogue number, and the measurement
     * decided it rather than taste:
     *
     *   truncate artist    -> "Crosby, Stills, Nash …  SD 7200"   still obvious
     *   truncate catalogue -> "Crosby, Stills, Nash & Young  S…"  identifies nothing
     *
     * A clipped artist stays readable because the distinguishing information is
     * front-loaded; a catalogue number\'s is spread across the whole string, so
     * a stub of one is not an identifier at all.
     */
    const text = spineText({
      artistName: 'Crosby, Stills, Nash & Young',
      title: 'Déjà Vu',
      catalogNumber: 'SD 7200',
    });

    expect(text.length).toBeLessThanOrEqual(SPINE_TEXT_BUDGET);
    expect(text, 'the identifier survives intact').toContain('SD 7200');
    expect(text, 'the artist is cut but still recognisable').toMatch(/^Crosby, Stills/);
    expect(text).toMatch(/…/);
  });

  it('keeps a catalogue number that alone fills the budget', () => {
    // Pathological, but the identifier is the last thing standing. Better a
    // spine that shows only the catalogue number than one showing neither.
    const text = spineText({
      artistName: 'Some Artist',
      title: 'Some Title',
      catalogNumber: 'A'.repeat(40),
    });

    expect(text).toContain('A'.repeat(40));
  });

  it('uses no separator characters, which buys back space for free', () => {
    // ` · ` cost three characters per join; two spaces read the same on a
    // rotated mono spine and give the title back six characters.
    expect(
      spineText({ artistName: 'Discharge', title: 'Hear Nothing', catalogNumber: 'CLAYLP 3' }),
    ).not.toContain('·');
  });
});

describe('the text budget tracks the spine height', () => {
  it('never exceeds what a spine that tall can hold', () => {
    /**
     * The budget is a function of how tall a spine is, and the two live in the
     * same module for that reason. Wrapping shelves shortened the spine from
     * 210px to 160px, and a budget still measured against 210 would let text
     * overflow again — the exact defect the truncation was written to fix,
     * returning through a constant nobody thought to re-derive.
     *
     * ~5.4px per character at 9px mono, measured.
     */
    expect(SPINE_TEXT_BUDGET).toBeLessThanOrEqual(Math.floor(SPINE_HEIGHT / 5.4));
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
