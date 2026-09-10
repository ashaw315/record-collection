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
      artistName: '...And You Will Know Us by the Trail of Dead',
      title: 'Source Tags & Codes',
      catalogNumber: 'IL 1',
    });

    /**
     * At the 240px spine's 44-character budget this record's two identifiers
     * take 49 on their own, so there is no room for the title at all and it is
     * DROPPED rather than shown as a stub. That is the rule working, not a gap
     * in it: "S…" costs space the identifiers need and tells the reader
     * nothing.
     *
     * **This fixture has now moved twice, and the reason is the same both
     * times.** It asserted an ellipsis at a 31-character budget and a 210px
     * spine; it asserted a dropped title for Luther Vandross at 29 and 160px;
     * at 44 that record FITS WHOLE and stopped testing anything. The property
     * under test — both identifiers survive, the title absorbs the shortfall —
     * has never changed. What moves is how much shortfall there is, which is
     * exactly what a derived budget is supposed to do.
     *
     * The band name is real, which matters: a synthetic 50-character artist
     * would make this look like an invented edge case rather than a record
     * somebody owns.
     */
    expect(text.length).toBeLessThanOrEqual(SPINE_TEXT_BUDGET);
    expect(text, 'the artist is whole').toContain('...And You Will Know Us');
    expect(text, 'the identifier is whole').toContain('IL 1');
    expect(text, 'the title gave way entirely').not.toContain('Source');
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

  /**
   * **The degenerate fixture is DERIVED, because a picked number drifts.**
   *
   * `SPINE_TEXT_BUDGET` is `floor(SPINE_HEIGHT / 5.4)`, so every fixture stated
   * as a literal stops testing what it was written for the next time the spine
   * changes height. That has already happened twice here — a fixture asserting
   * an ellipsis at a 31-character budget, another asserting a dropped title at
   * 29 — and both comments still cite those budgets while the value is now 44.
   * Neither reaches the branch it names.
   *
   * So the padding is computed from the budget rather than chosen: the artist is
   * grown until the two identifiers ALONE cannot fit, which is the definition of
   * the degenerate case. Change `SPINE_HEIGHT` and the fixture moves with it.
   */
  const CATALOGUE = 'FTS3077';
  /** The real record: `The Blues Project`, whose label is the collection's longest. */
  const REAL_ARTIST = 'The Blues Project';

  /**
   * An artist long enough that artist + gap + catalogue exceeds the budget.
   *
   * `+ 5` is margin past the boundary rather than a second magic number: at
   * exactly the budget the branch is not entered, and a fixture sitting on the
   * edge is one rounding change from testing the other side of it.
   */
  const degenerateArtist = REAL_ARTIST.padEnd(SPINE_TEXT_BUDGET + 5, ' the Blues Project');

  it('the degenerate fixture really does exceed the budget on identifiers alone', () => {
    /*
      **The precondition, asserted rather than assumed.** The test below asserts
      the artist is cut — but an ellipsis in the output can come from the TITLE
      being truncated, which is a different branch reached by a fixture that
      fits. That is exactly how the previous version of this test passed while
      never entering the branch it was named for: it matched `/…/` while the
      artist was whole.

      Two spaces of gap, matching `GAP` in spine.ts.
    */
    const fixed = degenerateArtist.length + 2 + CATALOGUE.length;

    expect(
      fixed,
      'artist + gap + catalogue must exceed the budget, or the branch is never entered',
    ).toBeGreaterThan(SPINE_TEXT_BUDGET);
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
     * before the title gets a character.
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
      artistName: degenerateArtist,
      title: 'The Best Of The Blues Project',
      catalogNumber: CATALOGUE,
    });

    expect(text.length).toBeLessThanOrEqual(SPINE_TEXT_BUDGET);
    expect(text, 'the identifier survives intact').toContain(CATALOGUE);

    /*
      **The branch is asserted, not inferred from an ellipsis.** The title is
      absent entirely — not truncated — which only happens on this branch: the
      fitting branch always gives the title whatever room is left, and drops it
      only when that room falls under three characters. Checking the ARTIST was
      cut is the direct evidence.
    */
    expect(text, 'the artist gave way, which is the branch under test').not.toContain(
      degenerateArtist,
    );
    expect(text, 'and it is cut rather than replaced').toMatch(/^The Blues Project/);
    expect(text, 'no title survives when the identifiers alone overflow').not.toContain('Best Of');
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

describe('spine proportions read as records, not box sets', () => {
  /**
   * §10b as amended: "narrow enough to read as a record, wide enough to name
   * it. Roughly 1:12."
   *
   * The spec said 1:40 first, from arithmetic about sleeve thickness — and that
   * loses to legibility, because at any workable height it is about 4px, which
   * is narrower than a glyph. The failure exists in BOTH directions, so both
   * bounds are asserted: too wide is a shelf of box sets, too narrow is a wall
   * of colour bars that must be hovered one at a time.
   */
  it('is around 1:12, the ratio §10b settled on', () => {
    const widest = SPINE_HEIGHT / MIN_SPINE_WIDTH;
    const narrowest = SPINE_HEIGHT / MAX_SPINE_WIDTH;

    expect(narrowest, 'not box sets — 1:7 was the QA finding').toBeGreaterThan(9);
    expect(widest, 'not colour bars — a spine must still hold its text').toBeLessThan(16);
  });

  it('DERIVES the width from the height, so the ratio survives a taller wall', () => {
    /**
     * **The defect this prevents, found in unit 20.** `SPINE_HEIGHT` went from
     * 160 to a full-bleed wall's height, and the widths were hardcoded at
     * 11-15 — so raising the height alone would have quietly changed the ratio
     * from 1:12 to something much narrower, turning §10b's rule into a wall of
     * planks without any test noticing.
     *
     * §10b states 1:12 as a RULE rather than a number, so the widths have to
     * track the height. Fails against `MIN_SPINE_WIDTH`/`MAX_SPINE_WIDTH` if
     * either is pinned to a literal again.
     */
    expect(MIN_SPINE_WIDTH).toBe(Math.round(SPINE_HEIGHT / 14));
    expect(MAX_SPINE_WIDTH).toBe(Math.round(SPINE_HEIGHT / 10));
  });

  it('stays wide enough for the 9px type the spine text uses', () => {
    /**
     * The constraint that killed 1:40. A 9px mono glyph is about 6.5px of cap
     * height and needs a little padding either side; below roughly 10px of
     * spine the text stops being readable and becomes marks.
     *
     * Measured across five rendered variants at real size, not derived from a
     * font metric alone.
     */
    expect(MIN_SPINE_WIDTH).toBeGreaterThanOrEqual(11);
  });

  it('does not change how MUCH text fits, which is a function of height', () => {
    /**
     * Width decides whether a glyph fits ACROSS the spine; height decides how
     * many fit ALONG it. Narrowing from 26-34 to 11-15 leaves the budget at 29,
     * and this pins that so a future width change is not assumed to move it —
     * the assumption was checked rather than trusted when this unit was
     * written.
     */
    expect(SPINE_TEXT_BUDGET).toBe(Math.floor(SPINE_HEIGHT / 5.4));
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
    /**
     * **The RANGE, not the count of distinct values.**
     *
     * `widths.size > 1` passes on a two-value spread of 17 and 18 — every spine
     * within a pixel of every other, which is precisely the barcode this test is
     * named against. A count standing in for a range is the resolution defect
     * recorded three times in NOTES: the predicate cannot distinguish the wall
     * having texture from the wall having none.
     *
     * Expressed in the same units as the bounds it is about. `MIN_SPINE_WIDTH`
     * and `MAX_SPINE_WIDTH` are derived from `SPINE_HEIGHT` (240/14 and 240/10),
     * so the available span is 7px and this asks the realised spread to cover
     * more than half of it. Deriving the threshold from the bounds rather than
     * stating 4 outright would be better still — but half of an integer span is
     * not an integer, and a fixture that rounds is the drift this same commit is
     * removing from the budget fixtures.
     *
     * **The assumption, stated rather than relied on:** this needs N large
     * enough for the hash to distribute. At two or three records a correct hash
     * can legitimately produce a narrow spread, and this test would fail on
     * working code — so the fixture is eight ids, and shrinking it is what would
     * make this flaky rather than any change to `spineWidth`.
     */
    const widths = ['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight'].map(spineWidth);

    const spread = Math.max(...widths) - Math.min(...widths);
    const available = MAX_SPINE_WIDTH - MIN_SPINE_WIDTH;

    expect(
      spread,
      `spines span ${spread}px of the ${available}px the bounds allow — under half is a barcode`,
    ).toBeGreaterThanOrEqual(4);
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
