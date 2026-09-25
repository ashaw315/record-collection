import { describe, expect, it } from 'vitest';
import {
  aboutBudget,
  ABOUT_CHAR_BUDGET,
  ABOUT_CLAMP_LINES,
  ABOUT_LINES,
  ENTRY_LINES,
  aboutCellState,
  present,
} from './about-cell';

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
    expect(ABOUT_CLAMP_LINES).toBe(9);
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
    expect(aboutBudget('')).toEqual({ chars: 0, budget: 535, over: 0 });
    expect(aboutBudget('a'.repeat(535))).toEqual({ chars: 535, budget: 535, over: 0 });
    expect(aboutBudget('a'.repeat(540))).toEqual({ chars: 540, budget: 535, over: 5 });
  });

  it('counts the text as the user sees it, not with trailing whitespace', () => {
    expect(aboutBudget('  abc  ').chars).toBe(3);
  });
});
