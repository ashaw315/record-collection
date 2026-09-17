/**
 * The no-cover sleeve's title: a DRAWN element, sized from its box and its
 * string (8a §11.3 as ruled). It stands in for artwork, so §4's scale does
 * not apply — the way the 72 derives from the year field and ornament from
 * its cell. Choosing a size at all was the defect.
 *
 * **The fit:** the largest size whose longest word fits the square's
 * measure, at most three lines, anchored top so a clip takes the tail.
 * Floored at 15, below which the title truncates at a derived cap — like the
 * spine label — rather than shrinking further, since type too small to read
 * stands in for nothing.
 *
 * The artist above it is READ and takes a scale size (LABEL): two elements
 * in one cell governed differently on read-versus-drawn, not on size.
 */

/** Below this the title is cut, not shrunk. */
export const SLEEVE_TYPE_FLOOR = 15;
export const SLEEVE_MAX_LINES = 3;
/** Line height, as the sleeve sets it. */
export const SLEEVE_LEADING = 0.95;
/**
 * Average advance of the app's sans — Inter Tight at 800 — per em, on
 * titles. **Measured, not estimated:** `measureText` in the rendered face
 * gave 0.477em on the collection's titles (0.544 on the lowercase alphabet;
 * the mono, for comparison, 0.600, which is the spine's measured advance).
 * A first estimate of 0.6 fitted the title a size too small.
 * `wall-cover.spec.ts` checks the rendered title's line boxes, which is the
 * measurement this number stands in for.
 */
export const TITLE_ADVANCE_EM = 0.48;

export type SleeveTitle = {
  size: number;
  text: string;
  lines: number;
  fitsLongestWord: boolean;
};

const width = (text: string, size: number) => text.length * size * TITLE_ADVANCE_EM;

/** Greedy word wrap on the measure; a word wider than the measure takes its own line. */
function wrap(words: readonly string[], size: number, measure: number): number {
  let lines = 1;
  let used = 0;
  for (const word of words) {
    const w = width(word, size);
    const space = used === 0 ? 0 : width(' ', size);
    if (used > 0 && used + space + w > measure) {
      lines += 1;
      used = w;
    } else {
      used += space + w;
    }
  }
  return lines;
}

export function sleeveTitle(title: string, measure: number): SleeveTitle {
  const words = title.split(/\s+/).filter((w) => w !== '');
  const longest = Math.max(...words.map((w) => w.length), 0);
  const max = Math.floor(measure / (SLEEVE_MAX_LINES * SLEEVE_LEADING));

  for (let size = max; size >= SLEEVE_TYPE_FLOOR; size -= 1) {
    if (width('x'.repeat(longest), size) > measure) continue;
    const lines = wrap(words, size, measure);
    if (lines <= SLEEVE_MAX_LINES) return { size, text: title, lines, fitsLongestWord: true };
  }

  /* At the floor: cut at a derived cap, the way the spine label is cut at 37. */
  const size = SLEEVE_TYPE_FLOOR;
  const perLine = Math.floor(measure / (size * TITLE_ADVANCE_EM));
  const cut: string[] = [];
  let capped = false;
  for (const word of words) {
    if (word.length > perLine) {
      cut.push(`${word.slice(0, perLine - 1)}…`);
      capped = true;
      break;
    }
    cut.push(word);
  }
  let text = cut.join(' ');
  if (!capped) {
    const cap = perLine * SLEEVE_MAX_LINES;
    if (text.length > cap) text = `${text.slice(0, cap - 1).trimEnd()}…`;
  }
  const kept = text.split(/\s+/);
  return { size, text, lines: Math.min(SLEEVE_MAX_LINES, wrap(kept, size, measure)), fitsLongestWord: true };
}
