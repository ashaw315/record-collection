import { describe, expect, it } from 'vitest';
import * as aboutCellModule from './about-cell';
import { ABOUT_QUALIFIER, aboutBudget, aboutControlLine, ABOUT_CHAR_BUDGET, ABOUT_LINES, ENTRY_LINES, aboutCellState, present } from './about-cell';

/**
 * §33 (d), amended: "The lower frame's last cell shows the record's About,
 * labelled ABOUT, with the Images N Manage → line at its foot. A record with
 * no About shows its latest journal entry instead, date and text; a record
 * with neither shows §6's diagonal. Absence is one state: an About or entry
 * that is null, empty or only whitespace, once trimmed, counts as none."
 *
 * Journal-first is withdrawn within §33 (33/journal-first).
 */
describe('§33 (d): the last cell is the About, else the entry, else nothing', () => {
  it('shows the About when there is one', () => {
    const s = aboutCellState({ about: 'Her last album for the label.', entry: { entry: 'Played it.', entryDate: '2026-09-20' } });
    expect(s.kind).toBe('about');
    expect(s.kind === 'about' && s.text).toBe('Her last album for the label.');
  });

  it('falls to the latest entry when there is no About', () => {
    const s = aboutCellState({ about: null, entry: { entry: 'Played it.', entryDate: '2026-09-20' } });
    expect(s.kind).toBe('entry');
    expect(s.kind === 'entry' && s.entryDate).toBe('2026-09-20');
  });

  it('is nothing when there is neither', () => {
    expect(aboutCellState({ about: null, entry: null }).kind).toBe('none');
  });

  /**
   * **Emptiness, not nullness.** The note version of this cell tested
   * `=== null`, so an empty string printed a heading over nothing with no
   * diagonal. That hole was unreachable for the note and is reachable for the
   * About, because Adam can clear one. §33 names the rule: "null, empty or
   * only whitespace, once trimmed, counts as none."
   */
  it('treats an empty or whitespace About as absent', () => {
    expect(present(null)).toBe(false);
    expect(present('')).toBe(false);
    expect(present('   \n\t ')).toBe(false);
    expect(present(' a ')).toBe(true);
    expect(aboutCellState({ about: '   ', entry: null }).kind).toBe('none');
    expect(aboutCellState({ about: '', entry: { entry: 'Played it.', entryDate: '2026-09-20' } }).kind).toBe('entry');
  });

  it('treats an empty entry as absent too', () => {
    expect(aboutCellState({ about: null, entry: { entry: '  ', entryDate: '2026-09-20' } }).kind).toBe('none');
  });

  /**
   * §33: "Claude writes it to fit ten lines of the cell... An About longer
   * than ten lines — a hand edit, or one written before this ruling — shows
   * nine lines and more ↓." The entry keeps the four-line clamp from the
   * paragraph journal-first withdrew only the first sentence of.
   */
  it('states the line rules', () => {
    expect(ABOUT_LINES).toBe(10);
    expect(ENTRY_LINES).toBe(4);
  });

  /**
   * **The character budget is MEASURED, on the collection's own text.** §33:
   * "Code converts the ten lines to a character budget measured on the
   * collection's own text, and the editor states it." Bisected in the built
   * cell at 13/1.5 on 322px: The Hurdy Gurdy Man fits ten lines to 535
   * characters and needs eleven at 547; Bitches Brew to 552, eleven at 559;
   * Gaucho's whole 555 fits; Loss Of Life's 482 fits. The budget that holds
   * for every text in the collection is the smallest, 535 -- wrapping
   * depends on where words break, so a single number can only be the floor
   * of the range.
   */
  it('carries the measured budget, which is the floor of the range', () => {
    expect(ABOUT_CHAR_BUDGET).toBe(535);
  });
});


/**
 * §33: "Code converts the ten lines to a character budget measured on the
 * collection's own text, and the editor states it." The editor's line reads
 * the budget from here; lines are measured in the editor itself.
 */
describe('the editor states the About budget', () => {
  it('counts characters against the measured budget', () => {
    /* `over` withdrawn by §34: the budget is a guide, and clamping is measured in the cell. */
    expect(aboutBudget('')).toEqual({ chars: 0, budget: 535 });
    expect(aboutBudget('a'.repeat(535))).toEqual({ chars: 535, budget: 535 });
    expect(aboutBudget('a'.repeat(540))).toEqual({ chars: 540, budget: 535 });
  });

  it('counts the text as the user sees it, not with trailing whitespace', () => {
    expect(aboutBudget('  abc  ').chars).toBe(3);
  });
});

/**
 * §36: the lines the rendered cell holds, not a count. Measured at 1440 on
 * the real rows: Gaucho's ten lines (195px at 19.5) fit a room of 213 and
 * go unclamped; The Hurdy Gurdy Man's fourteen do not, and with "more ↓"
 * taking a line the clamp is the budget less one, nine -- §33's 10 / 9
 * recovered from the cell rather than assumed. At 1320 the same cell holds
 * 162px of room: eight lines whole, and a clamp of seven.
 */

/**
 * §42 (step 50): "An About longer than its cell scrolls inside the cell;
 * there is no clamp and no more link." The nine-and-more clamp and its
 * room-derived budget are withdrawn (33/more-link).
 */
describe('§42: no clamp', () => {
  it('exports no clamp count and no clamp function', () => {
    expect(Object.keys(aboutCellModule).filter((k) => /CLAMP|clampFor/i.test(k))).toEqual([]);
  });
});

/**
 * **§53 (step 60a): the About cell carries its own control line.** "The
 * control line is the by-line's short form, 'Written by Claude', then Edit,
 * Delete and Write a new one... The by-line's qualifier moves to a hover
 * title on it, 'about the music, not a fact this app checked'... Where no
 * About exists the absence state carries Write one as the button itself.
 * Where writing is not configured it carries no control, as §36 rules."
 */
describe('§53: the control line, from the About’s provenance and the deployment', () => {
  it('names a generated About “Written by Claude”, with the qualifier as its title, and offers Edit, Delete and Write a new one', () => {
    expect(aboutControlLine({ about: 'Text.', editedAt: null, configured: true })).toEqual({ byline: 'Written by Claude', title: ABOUT_QUALIFIER, controls: ['edit', 'delete', 'generate'] });
  });

  it('names an edited About “Your own note”, with no qualifier', () => {
    expect(aboutControlLine({ about: 'Text.', editedAt: '2026-09-30T10:00:00.000Z', configured: true })).toEqual({ byline: 'Your own note', title: null, controls: ['edit', 'delete', 'generate'] });
  });

  it('drops Write a new one where writing is not configured, keeping Edit and Delete', () => {
    expect(aboutControlLine({ about: 'Text.', editedAt: null, configured: false }).controls).toEqual(['edit', 'delete']);
  });

  it('offers Write one alone where no About exists and writing is configured, and nothing where it is not', () => {
    expect(aboutControlLine({ about: null, editedAt: null, configured: true })).toEqual({ byline: null, title: null, controls: ['write'] });
    expect(aboutControlLine({ about: null, editedAt: null, configured: false })).toEqual({ byline: null, title: null, controls: [] });
  });

  it('treats a blank About as absent, as the cell does', () => {
    expect(aboutControlLine({ about: '   ', editedAt: null, configured: true }).controls).toEqual(['write']);
  });

  it('states the qualifier once, as the sentence §10b gives every About', () => {
    expect(ABOUT_QUALIFIER).toBe('about the music, not a fact this app checked');
  });
});
