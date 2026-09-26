/**
 * §33 (d), amended: the lower frame's last cell.
 *
 * "The lower frame's last cell shows the record's About, labelled ABOUT, with
 * the Images N Manage → line at its foot. A record with no About shows its
 * latest journal entry instead, date and text; a record with neither shows
 * §6's diagonal. Absence is one state: an About or entry that is null, empty
 * or only whitespace, once trimmed, counts as none."
 *
 * Journal-first is withdrawn within §33 (33/journal-first). The note leaves
 * the frame altogether and leads §9's Journal section, labelled NOTE.
 *
 * **Naming.** The About is the text SPEC §10b calls the snippet; it is stored
 * in `records.snippet`. §8.1 draws the line the same way: "the cell is
 * record.notes, the owner's own sentence; the section is record.snippet,
 * generated." The UI says About, the column stays snippet.
 */

/** §33: "Claude writes it to fit ten lines of the cell." */
export const ABOUT_LINES = 10;

/** §33: an About longer than ten lines "shows nine lines and more ↓". */
export const ABOUT_CLAMP_LINES = 9;

/** The entry fallback keeps the four-line clamp from the paragraph journal-first withdrew only the first sentence of. */
export const ENTRY_LINES = 4;

/**
 * §33: "Code converts the ten lines to a character budget measured on the
 * collection's own text, and the editor states it."
 *
 * **Measured, by bisection in the built cell** -- 13px at the built 1.5
 * leading on the cell's 322px inner width, on the four real Abouts:
 *
 * | text | fits ten lines to | needs eleven at |
 * |---|---|---|
 * | The Hurdy Gurdy Man | 535 | 547 |
 * | Bitches Brew | 552 | 559 |
 * | Gaucho | 555 (whole) | — |
 * | Loss Of Life | 482 (whole) | — |
 *
 * The budget is a RANGE, 535 to 555, because wrapping depends on where words
 * break and not only on how many there are. The number the editor states is
 * the floor of that range: the one that holds for every text in the
 * collection. Lines are the rule; characters are the guide.
 */
export const ABOUT_CHAR_BUDGET = 535;

/** §33's one state of absence: null, empty, or whitespace once trimmed. */
export function present(text: string | null | undefined): text is string {
  return typeof text === 'string' && text.trim() !== '';
}

export type AboutCellState =
  | { kind: 'about'; text: string }
  | { kind: 'entry'; text: string; entryDate: string }
  | { kind: 'none' };

export function aboutCellState({
  about,
  entry,
}: {
  about: string | null | undefined;
  entry: { entry: string; entryDate: string } | null | undefined;
}): AboutCellState {
  if (present(about)) return { kind: 'about', text: about.trim() };
  if (entry != null && present(entry.entry)) return { kind: 'entry', text: entry.entry.trim(), entryDate: entry.entryDate };
  return { kind: 'none' };
}

/**
 * The editor's statement of the budget: characters written against the guide.
 *
 * §34: "535 is a writing guide, not a limit: a text over it can still fit,
 * and Gaucho's 555 does." There is no `over` -- whether a text clamps is
 * measured in the rendered cell, and the editor reports that instead.
 */
export function aboutBudget(text: string): { chars: number; budget: number } {
  return { chars: text.trim().length, budget: ABOUT_CHAR_BUDGET };
}

/**
 * §36: the About's budget "is re-measured per width, as ten lines of the
 * rendered cell" -- and the rendered cell scales while its type holds, so
 * the lines it holds are what is measured, ten at 1440 and fewer in the
 * scaling band. `room` is the height left for the paragraph in its cell
 * (the clip's bottom less the paragraph's top and everything below it);
 * `more` is the height "more ↓" takes when the text is clamped.
 *
 * Returns null when every line fits the whole-line budget, else the lines
 * to clamp to: the budget less one, the line "more ↓" takes -- §33's "shows
 * nine lines and more ↓" for a budget of ten, recovered from the cell at
 * 1440 and scaled with it in the band. Never fewer than one. `more` is kept
 * as the link's measured height for the room's accounting by the caller.
 */
export function clampFor({ lines, room, lineHeight, more }: { lines: number; room: number; lineHeight: number; more: number }): number | null {
  void more;
  if (lineHeight <= 0) return null;
  const budget = Math.floor(room / lineHeight + 1e-6);
  if (lines <= budget) return null;
  return Math.max(1, budget - 1);
}
